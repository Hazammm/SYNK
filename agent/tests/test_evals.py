"""The evaluation harness itself, checked without calling a model."""

from __future__ import annotations

from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver

from evals.run import evaluate, markdown_report
from evals.score import Turn, load_cases, score, summarize, value_matches
from evals.workspace import respond
from synk_agent.graph import build_graph
from synk_agent.runner import AgentRunner
from evals.workspace import fake_synk

from .fakes import ScriptedModel, tool_call


def test_the_case_file_matches_the_prd_test_set():
    cases = load_cases()
    assert len(cases) == 30
    assert {category: sum(case["category"] == category for case in cases) for category in ("happy", "ambiguity", "denial", "edge")} == {"happy": 15, "ambiguity": 5, "denial": 5, "edge": 5}
    for case in cases:
        assert case["prompt"] and case["expect"], case["id"]
    tools = {call["tool"] for case in cases for call in case["expect"].get("calls", [])}
    assert {"create_ticket", "update_ticket", "find_tickets", "create_doc", "search_workspace"} <= tools  # every tool is exercised


def test_values_match_ignoring_case_with_alternatives():
    assert value_matches("fix login bug", "Fix login bug")
    assert value_matches("me|asra", "Asra Khan")
    assert value_matches("syn-12", "SYN-12")
    assert not value_matches("high", "medium")
    assert not value_matches("x", None)
