"""End-to-end turns through the real graph, with a scripted model and a fake Synk."""

from __future__ import annotations

import sqlite3

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver

from synk_agent.graph import build_graph, recent_messages
from synk_agent.runner import BUSY_REPLY, QUOTA_REPLY, STEPS_REPLY, AgentRunner

from .fakes import CONTEXT, TARGET, FakeSynk, ScriptedModel, tool_call

PREVIEW = {"ok": True, "summary": "Update SYN-12 “Login bug”: status To Do → Done.", "target": TARGET, "preview": {"changes": [{"field": "Status", "from": "To Do", "to": "Done"}]}}
UPDATED = {"ok": True, "summary": "Updated SYN-12: status To Do → Done.", "target": TARGET}


def make(replies, results=None, checkpointer=None, max_steps=14):
    model, synk = ScriptedModel(replies=list(replies)), FakeSynk(results)
    runner = AgentRunner(build_graph(model, checkpointer or InMemorySaver()), synk.api, max_steps)
    return runner, model, synk


def test_create_ticket_runs_without_confirmation_and_reports_the_action():
    created = {"ok": True, "summary": "Created SYN-13 “Login bug” in To Do on FYP.", "target": {**TARGET, "key": "SYN-13"}}
    runner, model, synk = make([tool_call("create_ticket", title="Login bug", priority="high", assignee=None), AIMessage("Created SYN-13.")], {"create_ticket": created})

    result = runner.run("thread-1", "token-1", CONTEXT, message="Create a high priority ticket for the login bug")

    assert result == {"reply": "Created SYN-13.", "actions": [{"tool": "create_ticket", "ok": True, "summary": created["summary"], "target": created["target"]}], "pending": None}
    # Arguments the model left empty are not sent, and the call carries the user's token.
    assert synk.calls == [{"tool": "create_ticket", "args": {"title": "Login bug", "priority": "high"}, "dry_run": False, "token": "token-1"}]
    assert model.bound == ["create_ticket", "update_ticket", "find_tickets"]
    system, question = model.seen[0]
    assert isinstance(system, SystemMessage) and "Synk FYP" in system.content and "2026-11-12" in system.content
    assert isinstance(question, HumanMessage)
    assert isinstance(model.seen[1][-1], ToolMessage)  # the model sees the tool result before replying


def test_a_denied_tool_call_is_reported_and_explained_not_retried():
    denied = {"ok": False, "code": "forbidden", "message": "You have view-only access to FYP, so I can't change its tickets."}
    runner, _, synk = make([tool_call("create_ticket", title="Nope"), AIMessage("You only have view access to FYP, so nothing was created.")], {"create_ticket": denied})

    result = runner.run("thread-1", "token-1", CONTEXT, message="Create a ticket")

    assert result["reply"].startswith("You only have view access")
    assert result["actions"] == [{"tool": "create_ticket", "ok": False, "summary": denied["message"]}]
    assert len(synk.calls) == 1


def test_update_waits_for_approval_then_runs_with_the_new_token():
    runner, model, synk = make([tool_call("update_ticket", ticket="SYN-12", status="Done"), AIMessage("SYN-12 is now Done.")], {"update_ticket:preview": PREVIEW, "update_ticket": UPDATED})

    first = runner.run("thread-1", "token-1", CONTEXT, message="Move SYN-12 to done")
    assert first["pending"] == {"tool": "update_ticket", "summary": PREVIEW["summary"], "changes": PREVIEW["preview"]["changes"], "target": TARGET}
    assert first["actions"] == [] and "confirm" in first["reply"].lower()
    assert synk.real_calls() == []  # only the preview has run
    assert len(model.seen) == 1

    second = runner.run("thread-1", "token-2", CONTEXT, decision="approve")
    assert second == {"reply": "SYN-12 is now Done.", "actions": [{"tool": "update_ticket", "ok": True, "summary": UPDATED["summary"], "target": TARGET}], "pending": None}
    assert synk.real_calls() == [{"tool": "update_ticket", "args": {"ticket": "SYN-12", "status": "Done"}, "dry_run": False, "token": "token-2"}]


def test_a_rejected_update_changes_nothing():
    runner, model, synk = make([tool_call("update_ticket", ticket="SYN-12", status="Done"), AIMessage("Okay, I left SYN-12 as it is.")], {"update_ticket:preview": PREVIEW})

    runner.run("thread-1", "token-1", CONTEXT, message="Move SYN-12 to done")
    result = runner.run("thread-1", "token-2", CONTEXT, decision="reject")

    assert result == {"reply": "Okay, I left SYN-12 as it is.", "actions": [], "pending": None}
    assert synk.real_calls() == []
    assert '"cancelled"' in model.seen[-1][-1].content  # the model is told the user said no


@pytest.mark.parametrize("preview", [
    {"ok": False, "code": "not_found", "message": "I couldn't find SYN-99 in this workspace, or you don't have access to it."},
    {"ok": False, "code": "ambiguous", "message": "More than one person matches “Sarah”.", "candidates": ["Sarah Khan", "Sarah Ali"]},
    {"ok": True, "summary": "SYN-12 already has those values, so nothing was changed.", "target": TARGET},
])
def test_an_update_with_nothing_to_confirm_does_not_pause(preview):
    runner, model, synk = make([tool_call("update_ticket", ticket="SYN-12", assignee="Sarah"), AIMessage("Which Sarah do you mean: Sarah Khan or Sarah Ali?")], {"update_ticket:preview": preview})

    result = runner.run("thread-1", "token-1", CONTEXT, message="Assign SYN-12 to Sarah")

    assert result["pending"] is None and result["reply"].startswith("Which Sarah")
    assert synk.real_calls() == []
    assert preview.get("message", preview.get("summary")) in model.seen[-1][-1].content  # the model is told why, candidates included


def test_decisions_and_messages_out_of_turn_are_handled_politely():
    runner, _, synk = make([tool_call("update_ticket", ticket="SYN-12", status="Done")], {"update_ticket:preview": PREVIEW})

    nothing = runner.run("thread-1", "token-1", CONTEXT, decision="approve")
    assert nothing["pending"] is None and "no longer waiting" in nothing["reply"]

    runner.run("thread-1", "token-1", CONTEXT, message="Move SYN-12 to done")
    reminder = runner.run("thread-1", "token-1", CONTEXT, message="Also do something else")
    assert reminder["pending"]["summary"] == PREVIEW["summary"] and "confirm or cancel" in reminder["reply"]
    assert synk.real_calls() == []


def preview_for(args):
    target = {**TARGET, "key": args["ticket"]}
    return {"ok": True, "summary": f"Update {args['ticket']}: status To Do → Done.", "target": target, "preview": {"changes": [{"field": "Status", "from": "To Do", "to": "Done"}]}}


TWO_UPDATES = AIMessage(content="", tool_calls=[
    {"name": "update_ticket", "args": {"ticket": "SYN-12", "status": "Done"}, "id": "a"},
    {"name": "create_ticket", "args": {"title": "Follow up"}, "id": "b"},
    {"name": "update_ticket", "args": {"ticket": "SYN-14", "status": "Done"}, "id": "c"},
])


def test_several_changes_in_one_turn_are_confirmed_together_before_anything_runs():
    runner, _, synk = make([TWO_UPDATES, AIMessage("All done.")], {"update_ticket:preview": preview_for})

    first = runner.run("thread-1", "token-1", CONTEXT, message="Move SYN-12 and SYN-14 to done and add a follow-up ticket")
    assert [change["field"] for change in first["pending"]["changes"]] == ["SYN-12 status", "SYN-14 status"]
    assert first["pending"]["summary"] == "Update SYN-12: status To Do → Done. Update SYN-14: status To Do → Done."
    assert synk.real_calls() == []  # not even the create has run, so approving cannot repeat it

    second = runner.run("thread-1", "token-2", CONTEXT, decision="approve")
    assert second["reply"] == "All done." and len(second["actions"]) == 3
    # Each call ran exactly once, in the order the model asked.
    assert [(call["tool"], call["args"].get("ticket")) for call in synk.real_calls()] == [("update_ticket", "SYN-12"), ("create_ticket", None), ("update_ticket", "SYN-14")]


def test_cancelling_skips_every_change_that_needed_approval():
    runner, model, synk = make([TWO_UPDATES, AIMessage("I created the follow-up and left the others alone.")], {"update_ticket:preview": preview_for})

    runner.run("thread-1", "token-1", CONTEXT, message="Move SYN-12 and SYN-14 to done and add a follow-up ticket")
    result = runner.run("thread-1", "token-2", CONTEXT, decision="reject")

    assert [call["tool"] for call in synk.real_calls()] == ["create_ticket"]  # new data never needed approval
    assert [action["tool"] for action in result["actions"]] == ["create_ticket"]
    assert [message.content.count('"cancelled"') for message in model.seen[-1][-3:]] == [1, 0, 1]


def test_unknown_tools_and_bad_arguments_are_reported_to_the_model_without_calling_synk():
    calls = AIMessage(content="", tool_calls=[
        {"name": "delete_workspace", "args": {}, "id": "a"},
        {"name": "create_ticket", "args": {"priority": "urgent"}, "id": "b"},
        {"name": "update_ticket", "args": {"status": "Done"}, "id": "c"},
    ])
    runner, model, synk = make([calls, AIMessage("I couldn't do that.")])

    result = runner.run("thread-1", "token-1", CONTEXT, message="Do some impossible things")

    assert synk.calls == [] and result["pending"] is None
    assert [action["ok"] for action in result["actions"]] == [False, False, False]
    assert "That tool does not exist." in model.seen[-1][-3].content
    assert "title" in model.seen[-1][-2].content and "ticket" in model.seen[-1][-1].content


def test_each_conversation_remembers_only_its_own_history():
    runner, model, _ = make([AIMessage("Hello Asra."), AIMessage("You said hi."), AIMessage("Hello again.")])

    runner.run("thread-1", "token-1", CONTEXT, message="hi")
    runner.run("thread-1", "token-1", CONTEXT, message="what did I say?")
    runner.run("thread-2", "token-1", CONTEXT, message="hi from another conversation")

    assert [message.content for message in model.seen[1][1:]] == ["hi", "Hello Asra.", "what did I say?"]
    assert [message.content for message in model.seen[2][1:]] == ["hi from another conversation"]


def test_the_token_and_system_prompt_are_never_written_to_storage(tmp_path):
    path = tmp_path / "conversations.sqlite"
    checkpointer = SqliteSaver(sqlite3.connect(path, check_same_thread=False))
    runner, _, _ = make([tool_call("update_ticket", ticket="SYN-12", status="Done"), AIMessage("Done.")], {"update_ticket:preview": PREVIEW, "update_ticket": UPDATED}, checkpointer)

    runner.run("thread-1", "secret-token-one", CONTEXT, message="Move SYN-12 to done")
    runner.run("thread-1", "secret-token-two", CONTEXT, decision="approve")
    checkpointer.conn.commit()

    stored = path.read_bytes()
    for name in ("conversations.sqlite-wal", "conversations.sqlite-journal"):
        if (tmp_path / name).exists():
            stored += (tmp_path / name).read_bytes()
    assert b"Move SYN-12 to done" in stored  # the conversation itself is saved
    assert b"secret-token" not in stored
    assert b"You are Synk AI" not in stored


@pytest.mark.parametrize(("error", "reply"), [
    (RuntimeError("429 You exceeded your current quota"), QUOTA_REPLY),
    (RuntimeError("503 This model is currently experiencing high demand"), BUSY_REPLY),
])
def test_provider_limits_become_a_friendly_reply_and_the_conversation_continues(error, reply):
    runner, model, _ = make([error, AIMessage("Back now.")])

    assert runner.run("thread-1", "token-1", CONTEXT, message="hi") == {"reply": reply, "actions": [], "pending": None}
    assert runner.run("thread-1", "token-1", CONTEXT, message="are you there?")["reply"] == "Back now."
    # The failed turn was closed, so the history the model sees alternates user and assistant.
    assert [type(message).__name__ for message in model.seen[-1][1:]] == ["HumanMessage", "AIMessage", "HumanMessage"]


def test_a_failure_after_a_change_still_reports_the_change():
    created = {"ok": True, "summary": "Created SYN-13 “Login bug” in To Do on FYP."}
    runner, _, _ = make([tool_call("create_ticket", title="Login bug"), RuntimeError("429 quota")], {"create_ticket": created})

    result = runner.run("thread-1", "token-1", CONTEXT, message="Create a ticket for the login bug")

    assert result["actions"] == [{"tool": "create_ticket", "ok": True, "summary": created["summary"]}]
    assert result["reply"].startswith(QUOTA_REPLY) and "completed first" in result["reply"]


def test_an_unexpected_model_error_is_raised_but_leaves_the_conversation_usable():
    runner, _, _ = make([ValueError("something else broke"), AIMessage("Fine now.")])

    with pytest.raises(ValueError):
        runner.run("thread-1", "token-1", CONTEXT, message="hi")
    assert runner.run("thread-1", "token-1", CONTEXT, message="hi again")["reply"] == "Fine now."


def test_a_model_that_never_stops_calling_tools_is_cut_off():
    runner, _, synk = make([tool_call("find_tickets", call_id=f"call-{index}", query="login") for index in range(10)], max_steps=6)

    result = runner.run("thread-1", "token-1", CONTEXT, message="Find the login ticket")

    assert result["reply"].startswith(STEPS_REPLY) and result["pending"] is None
    assert 1 <= len(synk.calls) <= 3


def test_long_conversations_are_trimmed_at_a_user_message():
    history = []
    for index in range(30):
        history += [HumanMessage(f"question {index}"), AIMessage(f"answer {index}")]
    trimmed = recent_messages(history, limit=5)
    assert isinstance(trimmed[0], HumanMessage) and trimmed[0].content == "question 28" and len(trimmed) == 4
    assert recent_messages(history[:4], limit=5) == history[:4]
