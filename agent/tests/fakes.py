"""Stand-ins for the model and for Synk, so the tests need no network or API key."""

from __future__ import annotations

import json
from typing import Any

import httpx
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

from synk_agent.synk_api import SynkApi

CONTEXT = {
    "today": "2026-11-12",
    "user": {"name": "Asra Khan"},
    "workspace": {"name": "Synk FYP", "role": "member"},
    "projects": [{
        "key": "SYN", "name": "FYP", "access": "edit",
        "boards": [{"name": "Main board", "statuses": ["To Do", "In Progress", "Review", "Done"]}],
        "members": ["Asra Khan", "Sarah Khan", "Sarah Ali"], "sprints": [{"name": "Sprint 5", "state": "active"}],
        "pages": ["Project brief", "Auth design spec"],
    }],
}
TARGET = {"type": "ticket", "id": "t1", "key": "SYN-12", "title": "Login bug", "projectId": "p1", "boardId": "b1"}


def tool_call(name: str, call_id: str = "call-1", **args: Any) -> AIMessage:
    """A model message asking to run one tool."""
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


class ScriptedModel(BaseChatModel):
    """Replies with the given messages in order. An exception in the script is raised instead."""

    replies: list[Any] = Field(default_factory=list)
    # The messages the model was shown on each call.
    seen: list[list[BaseMessage]] = Field(default_factory=list)
    bound: list[str] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedModel":
        self.bound.extend(tool.name for tool in tools)
        return self

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        self.seen.append(list(messages))
        if not self.replies:
            raise AssertionError("The model was called more often than the test scripted.")
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        return ChatResult(generations=[ChatGeneration(message=reply)])


class FakeSynk:
    """Records every tool call the agent makes and answers from a table of results."""

    def __init__(self, results: dict[str, Any] | None = None) -> None:
        # Keys are "tool" for real calls and "tool:preview" for dry runs. A value may be a function of the arguments.
        self.results = results or {}
        self.calls: list[dict[str, Any]] = []
        self.api = SynkApi("http://synk.test", transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        name = request.url.path.rsplit("/", 1)[-1]
        self.calls.append({"tool": name, "args": body["args"], "dry_run": body["dryRun"], "token": request.headers["authorization"].removeprefix("Bearer ")})
        result = self.results.get(f"{name}:preview" if body["dryRun"] else name, {"ok": True, "summary": "Done."})
        if callable(result):
            result = result(body["args"])
        if isinstance(result, httpx.Response):
            return result
        return httpx.Response(200, json=result)

    def real_calls(self) -> list[dict[str, Any]]:
        return [call for call in self.calls if not call["dry_run"]]
