"""Creates the chat model. The provider is a setting, so switching needs no code change."""

from __future__ import annotations

import os

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from .settings import Settings


def build_model(settings: Settings) -> BaseChatModel:
    # The PRD names the key LLM_API_KEY; Google's SDK looks for GOOGLE_API_KEY.
    if settings.model.startswith("google_genai:") and not os.environ.get("GOOGLE_API_KEY") and os.environ.get("LLM_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["LLM_API_KEY"]
    # Temperature 0 keeps tool choices as repeatable as the provider allows.
    return init_chat_model(settings.model, temperature=0, timeout=settings.model_timeout, max_retries=1)
