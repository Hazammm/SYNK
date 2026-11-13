"""Runs the 30-prompt accuracy evaluation against the configured model.

    python -m evals.run --out /results

Each prompt starts a fresh conversation in the real agent graph. Tool calls go to the rules-based
workspace in workspace.py. A report is written as JSON and Markdown, and the exit code is 1 when
accuracy is below the PRD's 90% target or a case could not be scored.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver

from synk_agent.graph import build_graph
from synk_agent.runner import BUSY_REPLY, QUOTA_REPLY, AgentRunner

from .score import Turn, load_cases, score, summarize
from .workspace import CONTEXT, fake_synk

TARGET = 0.9
RETRY_WAITS = (30, 60, 90)


def run_case(runner: AgentRunner, case: dict[str, Any]) -> Turn:
    """One prompt in a new conversation; returns the reply and every tool call the model made."""
    thread = f"eval-{case['id']}-{time.time_ns()}"
    result = runner.run(thread, "eval-token", CONTEXT, message=case["prompt"])
    messages = runner.graph.get_state({"configurable": {"thread_id": thread}}).values.get("messages", [])
    calls = [{"tool": call["name"], "args": call["args"]} for message in messages if isinstance(message, AIMessage) for call in message.tool_calls]
    return Turn(reply=result["reply"], calls=calls, actions=result["actions"], pending=result["pending"])


def is_provider_problem(turn: Turn) -> bool:
    return turn.reply.startswith(QUOTA_REPLY) or turn.reply.startswith(BUSY_REPLY)


def evaluate(runner: AgentRunner, cases: list[dict[str, Any]], delay: float = 0, sleep: Callable[[float], None] = time.sleep, log: Callable[[str], None] = print) -> list[dict[str, Any]]:
    results = []
    for index, case in enumerate(cases, start=1):
        try:
            turn = run_case(runner, case)
        except Exception as error:  # an unexpected failure should not stop the other prompts
            turn = Turn(reply=f"{BUSY_REPLY} ({type(error).__name__}: {str(error)[:120]})")
        # A rate limit is not the model's mistake: wait and retry the same prompt.
        for wait in RETRY_WAITS:
            if not is_provider_problem(turn):
                break
            log(f"  rate limited on {case['id']}, retrying in {wait}s")
            sleep(wait)
            try:
                turn = run_case(runner, case)
            except Exception as error:
                turn = Turn(reply=f"{BUSY_REPLY} ({type(error).__name__}: {str(error)[:120]})")
        if is_provider_problem(turn):
            status, problems = "error", ["the model was unavailable or over quota"]
        else:
            problems = score(case["expect"], turn)
            status = "fail" if problems else "pass"
        results.append({
            "id": case["id"], "category": case["category"], "prompt": case["prompt"], "status": status, "problems": problems,
            "reply": turn.reply, "calls": turn.calls, "pending": bool(turn.pending),
        })
        log(f"[{index:2}/{len(cases)}] {status.upper():5} {case['id']}" + (f" - {'; '.join(problems)}" if problems else ""))
        if delay and index < len(cases):
            sleep(delay)
    return results
