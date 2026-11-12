"""Runs one turn of a conversation and reports what happened in plain data."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError
from langgraph.types import Command

from .prompt import build_system_prompt
from .synk_api import SynkApi
from .tools import RunContext

QUOTA_REPLY = "The AI model's free quota is used up for the moment. Please try again in a minute."
BUSY_REPLY = "The AI model is busy right now. Please try again shortly."
STEPS_REPLY = "I couldn't finish that in a reasonable number of steps. Please try asking for one thing at a time."
ERROR_NOTE = "I ran into an error before I could reply."


def text_of(message: AnyMessage) -> str:
    """The plain text of a model message, whichever shape the provider used."""
    content = message.content
    if isinstance(content, str):
        return content.strip()
    parts = [part if isinstance(part, str) else part.get("text", "") for part in content if isinstance(part, str) or part.get("type") == "text"]
    return "".join(parts).strip()


def collect_actions(messages: list[AnyMessage]) -> list[dict[str, Any]]:
    """Turns this turn's tool results into the "actions taken" list shown to the user."""
    actions = []
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        try:
            result = json.loads(message.content) if isinstance(message.content, str) else None
        except ValueError:
            result = None
        if not isinstance(result, dict):
            actions.append({"tool": message.name or "tool", "ok": False, "summary": "This step could not be run, so nothing was changed."})
        elif result.get("code") != "cancelled":
            action = {"tool": message.name or "tool", "ok": result.get("ok") is True, "summary": str(result.get("summary") or result.get("message") or "")}
            if isinstance(result.get("target"), dict):
                action["target"] = result["target"]
            actions.append(action)
    return actions


def pending_of(interrupts: list[Any]) -> dict[str, Any] | None:
    """Describes what is waiting for confirmation; several waiting changes are shown as one request."""
    values = [item for interrupted in interrupts if isinstance(interrupted.value, dict) for item in interrupted.value.get("items") or []]
    if not values:
        return None
    if len(values) == 1:
        first = values[0]
        return {"tool": first.get("tool", "tool"), "summary": first.get("summary", ""), "changes": first.get("changes") or [], **({"target": first["target"]} if first.get("target") else {})}
    changes = [
        {**change, "field": f"{(value.get('target') or {}).get('key', 'Ticket')} {str(change.get('field', '')).lower()}"}
        for value in values for change in value.get("changes") or []
    ]
    return {"tool": values[0].get("tool", "tool"), "summary": " ".join(value.get("summary", "") for value in values), "changes": changes}


def provider_problem(error: BaseException) -> str | None:
    """Recognises provider errors the user can simply wait out."""
    seen: BaseException | None = error
    while seen is not None:
        text = f"{type(seen).__name__} {seen}".lower()
        if any(marker in text for marker in ("429", "quota", "resourceexhausted", "resource_exhausted", "ratelimit", "rate limit")):
            return QUOTA_REPLY
        if any(marker in text for marker in ("503", "unavailable", "overloaded", "high demand")):
            return BUSY_REPLY
        seen = seen.__cause__ or seen.__context__
    return None


class AgentRunner:
    def __init__(self, graph: Any, api: SynkApi, max_steps: int = 14) -> None:
        self.graph = graph
        self.api = api
        self.max_steps = max_steps

    def run(self, thread_id: str, user_token: str, context: dict[str, Any], message: str | None = None, decision: str | None = None) -> dict[str, Any]:
        config = {
            "configurable": {"thread_id": thread_id, "synk": RunContext(api=self.api, token=user_token, system_prompt=build_system_prompt(context))},
            "recursion_limit": self.max_steps,
        }
        state = self.graph.get_state(config)
        waiting = list(state.interrupts)
        seen = len(state.values.get("messages", []))

        if decision is not None:
            if not waiting:
                return {"reply": "That change is no longer waiting for confirmation. Please ask again.", "actions": [], "pending": None}
            turn: Any = Command(resume={"approved": decision == "approve"})
        elif waiting:
            return {"reply": "Please confirm or cancel the pending change first.", "actions": [], "pending": pending_of(waiting)}
        else:
            turn = {"messages": [HumanMessage(message or "")]}

        try:
            result = self.graph.invoke(turn, config)
        except Exception as error:
            reply = STEPS_REPLY if isinstance(error, GraphRecursionError) else provider_problem(error)
            # Steps that finished before the failure really happened, so they are still reported.
            actions = collect_actions(self.graph.get_state(config).values.get("messages", [])[seen:])
            self._close_turn(config, reply or ERROR_NOTE)
            if reply is None:
                raise
            return {"reply": f"{reply} The steps listed below were completed first." if actions else reply, "actions": actions, "pending": None}

        new_messages = result["messages"][seen:]
        actions = collect_actions(new_messages)
        pending = pending_of(result.get("__interrupt__") or [])
        if pending:
            return {"reply": "Please confirm this change before I make it.", "actions": actions, "pending": pending}
        last = new_messages[-1] if new_messages else None
        reply = text_of(last) if isinstance(last, AIMessage) else ""
        if not reply:
            reply = " ".join(action["summary"] for action in actions) or "I couldn't come up with a reply. Please try rephrasing."
        return {"reply": reply, "actions": actions, "pending": None}

    def _close_turn(self, config: dict[str, Any], note: str) -> None:
        """Ends an interrupted turn with a model message, so the saved history stays well-formed."""
        if self.graph.get_state(config).interrupts:
            return
        self.graph.update_state(config, {"messages": [AIMessage(note)]}, as_node="model")
