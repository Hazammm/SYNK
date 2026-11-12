"""HTTP API of the agent service. Only the Synk Next.js server may call it."""

from __future__ import annotations

import hmac
import sqlite3
import threading
from collections import defaultdict
from typing import Any, Literal

from fastapi import FastAPI, Header, HTTPException
from langchain_core.language_models import BaseChatModel
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from .graph import build_graph
from .model import build_model
from .runner import AgentRunner
from .settings import Settings, load_settings
from .synk_api import SynkApi


class ForgetRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    thread_ids: list[str] = Field(max_length=500)


class ChatRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    thread_id: str = Field(min_length=1, max_length=100)
    user_token: str = Field(min_length=1, max_length=2000)
    context: dict[str, Any]
    message: str | None = Field(None, min_length=1, max_length=4000)
    decision: Literal["approve", "reject"] | None = None

    @model_validator(mode="after")
    def one_kind_of_turn(self) -> "ChatRequest":
        if (self.message is None) == (self.decision is None):
            raise ValueError("Send either a message or a decision.")
        return self


def sqlite_checkpointer(settings: Settings) -> SqliteSaver:
    """Conversation memory in a local SQLite file, so it survives restarts."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return SqliteSaver(sqlite3.connect(settings.data_dir / "conversations.sqlite", check_same_thread=False))


def create_app(settings: Settings | None = None, model: BaseChatModel | None = None, checkpointer: Any = None, api: SynkApi | None = None) -> FastAPI:
    """Builds the service. Tests pass a scripted model, in-memory storage and a fake Synk API."""
    settings = settings or load_settings()
    api = api or SynkApi(settings.api_url)
    checkpointer = checkpointer or sqlite_checkpointer(settings)
    graph = build_graph(model or build_model(settings), checkpointer)
    runner = AgentRunner(graph, api, settings.max_steps)
    # One turn at a time per conversation.
    locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)
    app = FastAPI(title="Synk agent", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "model": settings.model}

    def authorize(authorization: str | None) -> None:
        expected = f"Bearer {settings.service_secret}".encode()
        if not hmac.compare_digest((authorization or "").encode(), expected):
            raise HTTPException(status_code=401, detail="Not authorized.")

    @app.post("/threads/delete")
    def forget(body: ForgetRequest, authorization: str | None = Header(None)) -> dict[str, int]:
        """Deletes the agent's memory of these conversations, after the user deleted them in Synk."""
        authorize(authorization)
        for thread_id in body.thread_ids:
            with locks[thread_id]:
                checkpointer.delete_thread(thread_id)
            locks.pop(thread_id, None)
        return {"deleted": len(body.thread_ids)}

    @app.post("/chat")
    def chat(body: ChatRequest, authorization: str | None = Header(None)) -> dict[str, Any]:
        authorize(authorization)
        with locks[body.thread_id]:
            return runner.run(body.thread_id, body.user_token, body.context, body.message, body.decision)

    return app
