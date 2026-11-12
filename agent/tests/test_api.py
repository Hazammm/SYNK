from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver

from synk_agent.api import create_app
from synk_agent.settings import DEFAULT_MODEL, Settings, load_settings

from .fakes import CONTEXT, FakeSynk, ScriptedModel, tool_call

SECRET = "test-only-service-secret-0123456789abcdef"
AUTH = {"Authorization": f"Bearer {SECRET}"}


def client(replies=(), results=None):
    synk = FakeSynk(results)
    app = create_app(Settings(service_secret=SECRET), model=ScriptedModel(replies=list(replies)), checkpointer=InMemorySaver(), api=synk.api)
    return TestClient(app), synk


def test_health_reports_the_configured_model():
    http, _ = client()
    assert http.get("/health").json() == {"status": "ok", "model": DEFAULT_MODEL}


def test_chat_requires_the_shared_secret():
    http, _ = client([AIMessage("hi")])
    body = {"threadId": "t1", "userToken": "token-1", "context": CONTEXT, "message": "hello"}
    assert http.post("/chat", json=body).status_code == 401
    assert http.post("/chat", json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert http.post("/chat", json=body, headers={"Authorization": SECRET}).status_code == 401
    assert http.post("/chat", json=body, headers=AUTH).json() == {"reply": "hi", "actions": [], "pending": None}


@pytest.mark.parametrize("change", [
    {"message": None},  # neither a message nor a decision
    {"decision": "approve"},  # both
    {"message": ""},
    {"message": "x" * 4001},
    {"decision": "maybe", "message": None},
    {"threadId": ""},
    {"surprise": True},
])
def test_chat_rejects_malformed_turns(change):
    http, _ = client([AIMessage("hi")])
    body = {"threadId": "t1", "userToken": "token-1", "context": CONTEXT, "message": "hello", **change}
    body = {key: value for key, value in body.items() if value is not None}
    assert http.post("/chat", json=body, headers=AUTH).status_code == 422


def test_a_full_confirmation_round_trip_over_http():
    preview = {"ok": True, "summary": "Update SYN-12: status To Do → Done.", "preview": {"changes": [{"field": "Status", "from": "To Do", "to": "Done"}]}}
    http, synk = client([tool_call("update_ticket", ticket="SYN-12", status="Done"), AIMessage("Done.")], {"update_ticket:preview": preview, "update_ticket": {"ok": True, "summary": "Updated SYN-12."}})
    base = {"threadId": "t1", "context": CONTEXT}

    first = http.post("/chat", json={**base, "userToken": "token-1", "message": "Move SYN-12 to done"}, headers=AUTH).json()
    assert first["pending"]["changes"] == preview["preview"]["changes"] and synk.real_calls() == []

    second = http.post("/chat", json={**base, "userToken": "token-2", "decision": "approve"}, headers=AUTH).json()
    assert second == {"reply": "Done.", "actions": [{"tool": "update_ticket", "ok": True, "summary": "Updated SYN-12."}], "pending": None}
    assert [call["token"] for call in synk.real_calls()] == ["token-2"]


def test_forgetting_conversations_needs_the_secret_and_clears_their_memory():
    model = ScriptedModel(replies=[AIMessage("First."), AIMessage("Fresh start.")])
    checkpointer = InMemorySaver()
    http = TestClient(create_app(Settings(service_secret=SECRET), model=model, checkpointer=checkpointer, api=FakeSynk().api))
    turn = {"threadId": "t1", "userToken": "token-1", "context": CONTEXT}
    http.post("/chat", json={**turn, "message": "remember this"}, headers=AUTH)

    assert http.post("/threads/delete", json={"threadIds": ["t1"]}).status_code == 401
    assert http.post("/threads/delete", json={"threadIds": ["t1", "never-existed"]}, headers=AUTH).json() == {"deleted": 2}
    http.post("/chat", json={**turn, "message": "hello again"}, headers=AUTH)
    assert [message.content for message in model.seen[-1][1:]] == ["hello again"]  # the earlier turn is gone
    assert http.post("/threads/delete", json={"threadIds": "t1"}, headers=AUTH).status_code == 422


def test_settings_need_a_real_secret_and_fall_back_to_defaults():
    with pytest.raises(RuntimeError):
        load_settings({})
    with pytest.raises(RuntimeError):
        load_settings({"AI_SERVICE_SECRET": "too-short"})
    settings = load_settings({"AI_SERVICE_SECRET": SECRET})
    assert (settings.api_url, settings.model, settings.data_dir) == ("http://localhost:3000", DEFAULT_MODEL, Path("data"))
    custom = load_settings({"AI_SERVICE_SECRET": SECRET, "NEXTJS_API_URL": "http://host.docker.internal:3000", "LLM_MODEL": "ollama:qwen3", "AGENT_DATA_DIR": "/data"})
    assert (custom.api_url, custom.model, custom.data_dir) == ("http://host.docker.internal:3000", "ollama:qwen3", Path("/data"))
