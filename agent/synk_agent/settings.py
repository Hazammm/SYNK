"""Configuration for the agent service, read once from environment variables."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MODEL = "google_genai:gemini-3.5-flash"


@dataclass(frozen=True)
class Settings:
    # Shared with the Next.js server, which must present it on every request.
    service_secret: str
    # Where tool calls are sent. From inside Docker this is the host machine.
    api_url: str = "http://localhost:3000"
    # "<provider>:<model>", for example "groq:llama-3.3-70b-versatile" or "ollama:qwen3".
    model: str = DEFAULT_MODEL
    data_dir: Path = Path("data")
    model_timeout: float = 45.0
    # Upper bound on graph steps in one turn; each model call and each tool run is a step.
    max_steps: int = 14


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env
    secret = env.get("AI_SERVICE_SECRET", "").strip()
    if len(secret) < 32:
        raise RuntimeError("Set AI_SERVICE_SECRET to a random value of at least 32 characters, the same one the Next.js server uses.")
    return Settings(
        service_secret=secret,
        api_url=env.get("NEXTJS_API_URL", "").strip() or Settings.api_url,
        model=env.get("LLM_MODEL", "").strip() or DEFAULT_MODEL,
        data_dir=Path(env.get("AGENT_DATA_DIR", "").strip() or "data"),
    )
