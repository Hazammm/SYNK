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


def test_the_workspace_answers_like_the_real_tools():
    assert respond("update_ticket", {"ticket": "SYN-12", "assignee": "Sarah"}, True)["candidates"] == ["Sarah Khan", "Sarah Ali"]
    assert respond("update_ticket", {"ticket": "SYN-14", "assignee": "Khan"}, True)["candidates"] == ["Asra Khan", "Sarah Khan"]
    assert respond("update_ticket", {"ticket": "MKT-3", "status": "Done"}, True)["code"] == "forbidden"
    assert respond("update_ticket", {"ticket": "SYN-999", "status": "Done"}, True)["code"] == "not_found"
    assert "already has those values" in respond("update_ticket", {"ticket": "SYN-30", "status": "done"}, True)["summary"]
    assert respond("update_ticket", {"ticket": "syn-12", "status": "done"}, True)["preview"]["changes"] == [{"field": "Status", "from": "To Do", "to": "Done"}]
    assert respond("create_ticket", {"title": "x", "project": "Secret"}, False)["code"] == "not_found"
    assert respond("create_ticket", {"title": "x", "project": "Marketing site"}, False)["code"] == "forbidden"
    assert respond("create_ticket", {"title": "x", "assignee": "me"}, False)["ok"] is True
    assert respond("create_doc", {"title": "x", "parent": "brief"}, False)["candidates"] == ["Project brief", "Design brief"]
    assert [row["key"] for row in respond("find_tickets", {"query": "login"}, False)["data"]["tickets"]] == ["SYN-12", "SYN-21"]
    assert [row["key"] for row in respond("find_tickets", {"query": "dark mode ticket"}, False)["data"]["tickets"]] == ["SYN-14"]
    assert [row["key"] for row in respond("find_tickets", {"assignee": "me"}, False)["data"]["tickets"]] == ["SYN-12"]


def test_evaluate_scores_turns_and_retries_rate_limits_without_counting_them():
    cases = [case for case in load_cases() if case["id"] in ("create-basic", "edge-off-topic")]
    model = ScriptedModel(replies=[
        RuntimeError("429 You exceeded your current quota"),  # first attempt at create-basic
        tool_call("create_ticket", title="Fix login bug", priority="high"), AIMessage("Created SYN-40."),
        AIMessage("Here is a short poem about cats."),  # off-topic: no tools, so it passes
    ])
    runner = AgentRunner(build_graph(model, InMemorySaver()), fake_synk())
    waits: list[float] = []
    results = evaluate(runner, cases, sleep=waits.append, log=lambda line: None)
    assert [result["status"] for result in results] == ["pass", "pass"]
    assert waits == [30]
    summary = summarize(results)
    assert (summary["passed"], summary["scored"], summary["accuracy"]) == (2, 2, 1.0)
    assert "| `create-basic` | happy | pass | - |" in markdown_report("scripted", summary, results)


def test_an_unexpected_crash_in_one_prompt_does_not_stop_the_run():
    cases = [case for case in load_cases() if case["id"] in ("create-basic", "edge-off-topic")]
    model = ScriptedModel(replies=[ValueError("bad response"), ValueError("bad response"), ValueError("bad response"), ValueError("bad response"), AIMessage("A poem about cats.")])
    results = evaluate(AgentRunner(build_graph(model, InMemorySaver()), fake_synk()), cases, sleep=lambda seconds: None, log=lambda line: None)
    assert [result["status"] for result in results] == ["error", "pass"]


def test_a_model_that_stays_over_quota_is_reported_as_not_scored():
    case = next(case for case in load_cases() if case["id"] == "create-basic")
    model = ScriptedModel(replies=[RuntimeError("429 quota")] * 4)
    results = evaluate(AgentRunner(build_graph(model, InMemorySaver()), fake_synk()), [case], sleep=lambda seconds: None, log=lambda line: None)
    assert results[0]["status"] == "error"
    assert summarize(results) == {"passed": 0, "scored": 0, "errors": 1, "accuracy": 0.0, "by_category": {"happy": {"passed": 0, "total": 0}, "ambiguity": {"passed": 0, "total": 0}, "denial": {"passed": 0, "total": 0}, "edge": {"passed": 0, "total": 0}}}
