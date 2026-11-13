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


def test_scoring_explains_each_kind_of_failure():
    created = Turn(reply="Created SYN-40.", calls=[{"tool": "create_ticket", "args": {"title": "Fix login bug", "priority": "high"}}],
                   actions=[{"tool": "create_ticket", "ok": True, "summary": "Created"}])
    assert score({"calls": [{"tool": "create_ticket", "args": {"title": "fix login bug", "priority": "high"}}]}, created) == []
    assert score({"calls": [{"tool": "create_ticket", "args": {"priority": "low"}}]}, created) == ["expected create_ticket with {'priority': 'low'}"]
    assert score({"pending": True}, created) == ["expected the change to wait for confirmation"]
    assert score({"no_tools": True}, created) == ["expected no tool calls, got ['create_ticket']"]
    assert score({"no_mutation": True}, created)[0].startswith("expected nothing to change")
    question = Turn(reply="Which one: Sarah Khan or Sarah Ali?")
    assert score({"asks": True, "reply_all": ["sarah khan", "sarah ali"], "no_mutation": True, "no_tools": True}, question) == []
    assert score({"asks": True}, Turn(reply="Done.")) == ["expected a clarifying question"]
    assert score({"reply_any": ["access", "permission"]}, Turn(reply="Nothing was changed.")) == ["reply should mention one of ['access', 'permission']"]
    # A failed mutation is not a change, and a pending one is.
    denied = Turn(reply="You only have view access.", actions=[{"tool": "create_ticket", "ok": False, "summary": "view-only"}])
    assert score({"no_mutation": True}, denied) == []
    assert score({"no_mutation": True}, Turn(reply="Please confirm.", pending={"tool": "update_ticket"})) != []
