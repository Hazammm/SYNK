"""Scores one agent turn against a case's expectations. Pure functions, unit tested without a model."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CASES_FILE = Path(__file__).with_name("cases.json")
CATEGORIES = {"happy": 15, "ambiguity": 5, "denial": 5, "edge": 5}
MUTATING = {"create_ticket", "update_ticket", "create_doc"}


@dataclass
class Turn:
    """What the agent did for one prompt."""

    reply: str
    calls: list[dict[str, Any]] = field(default_factory=list)  # every tool call the model made: {"tool", "args"}
    actions: list[dict[str, Any]] = field(default_factory=list)  # the turn's "actions taken"
    pending: dict[str, Any] | None = None


def load_cases(path: Path = CASES_FILE) -> list[dict[str, Any]]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    ids = [case["id"] for case in cases]
    if len(set(ids)) != len(ids):
        raise ValueError("Case ids must be unique.")
    counts = {category: sum(case["category"] == category for case in cases) for category in CATEGORIES}
    if counts != CATEGORIES:
        raise ValueError(f"The PRD's test set has 15 happy, 5 ambiguity, 5 denial and 5 edge cases, not {counts}.")
    return cases


def value_matches(expected: str, actual: Any) -> bool:
    """Case-insensitive containment, with "a|b" meaning either is fine."""
    if actual is None:
        return False
    text = str(actual).lower()
    return any(option.strip().lower() in text for option in expected.split("|"))


def call_matches(expected: dict[str, Any], actual: dict[str, Any]) -> bool:
    if expected["tool"] != actual["tool"]:
        return False
    return all(value_matches(value, actual["args"].get(name)) for name, value in expected.get("args", {}).items())


def score(expect: dict[str, Any], turn: Turn) -> list[str]:
    """Returns the reasons the turn failed; an empty list means it passed."""
    problems: list[str] = []
    reply = turn.reply.lower()
    for wanted in expect.get("calls", []):
        if not any(call_matches(wanted, call) for call in turn.calls):
            problems.append(f"expected {wanted['tool']} with {wanted.get('args', {})}")
    if expect.get("pending") and not turn.pending:
        problems.append("expected the change to wait for confirmation")
    if expect.get("no_tools") and turn.calls:
        problems.append(f"expected no tool calls, got {[call['tool'] for call in turn.calls]}")
    if expect.get("no_mutation"):
        changed = [action["tool"] for action in turn.actions if action.get("ok") and action["tool"] in MUTATING]
        if changed or turn.pending:
            problems.append(f"expected nothing to change, but {changed or 'a change is pending'}")
    if expect.get("asks") and "?" not in turn.reply:
        problems.append("expected a clarifying question")
    missing = [text for text in expect.get("reply_all", []) if text not in reply]
    if missing:
        problems.append(f"reply should mention {missing}")
    if expect.get("reply_any") and not any(text in reply for text in expect["reply_any"]):
        problems.append(f"reply should mention one of {expect['reply_any']}")
    return problems


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    scored = [result for result in results if result["status"] != "error"]
    passed = [result for result in scored if result["status"] == "pass"]
    by_category = {
        category: {"passed": sum(r["status"] == "pass" for r in scored if r["category"] == category), "total": sum(r["category"] == category for r in scored)}
        for category in CATEGORIES
    }
    return {
        "passed": len(passed), "scored": len(scored), "errors": len(results) - len(scored),
        "accuracy": round(len(passed) / len(scored), 4) if scored else 0.0, "by_category": by_category,
    }
