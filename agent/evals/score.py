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
