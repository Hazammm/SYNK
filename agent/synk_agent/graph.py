"""The agent loop as a LangGraph state graph.

    START -> model -> (tool calls?) -> tools -> model -> ... -> END

The model decides whether to call tools. The tools node previews any change to
existing data, pauses for the user's approval, and only then runs the calls.
"""

from __future__ import annotations

import json
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import tools_condition
from langgraph.types import interrupt

from .synk_api import failure
from .tools import CANCELLED, TOOL_SPECS, RunContext, ToolSpec, clean_args, tool_schemas

# How much of a long conversation the model is shown each turn.
MAX_HISTORY = 40


def recent_messages(messages: list[AnyMessage], limit: int = MAX_HISTORY) -> list[AnyMessage]:
    """Returns the tail of a conversation, always starting at a user message.

    Cutting at a user message keeps every tool call together with its result,
    which model providers require.
    """
    if len(messages) <= limit:
        return messages
    for index in range(len(messages) - limit, len(messages)):
        if isinstance(messages[index], HumanMessage):
            return messages[index:]
    return messages[-1:]


def build_graph(model: BaseChatModel, checkpointer: Any, specs: list[ToolSpec] | None = None):
    specs_by_name = {spec.name: spec for spec in (TOOL_SPECS if specs is None else specs)}
    model_with_tools = model.bind_tools(tool_schemas(list(specs_by_name.values())))

    def call_model(state: MessagesState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        context: RunContext = config["configurable"]["synk"]
        # The system prompt is rebuilt every turn from current access and is never saved with the conversation.
        return {"messages": [model_with_tools.invoke([SystemMessage(context.system_prompt), *recent_messages(state["messages"])])]}

    def run_tools(state: MessagesState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        """Runs the tool calls the model asked for, as the user.

        Nothing is changed before the pause: resuming re-runs this function from
        the top, so everything above `interrupt` must be safe to repeat.
        """
        context: RunContext = config["configurable"]["synk"]
        calls = state["messages"][-1].tool_calls
        results: dict[str, dict[str, Any]] = {}
        prepared: dict[str, dict[str, Any]] = {}
        waiting: list[dict[str, Any]] = []

        # 1. Check every call, and preview the ones that change existing data.
        for call in calls:
            spec = specs_by_name.get(call["name"])
            args = clean_args(spec, call["args"]) if spec else "That tool does not exist."
            if isinstance(args, str):
                results[call["id"]] = failure("invalid", args)
                continue
            prepared[call["id"]] = args
            if spec.confirm:
                preview = context.api.call_tool(spec.name, args, context.token, dry_run=True)
                changes = (preview.get("preview") or {}).get("changes")
                if preview.get("ok") and changes:
                    waiting.append({"tool": spec.name, "summary": preview.get("summary", ""), "target": preview.get("target"), "changes": changes})
                else:
                    # A denial, an unclear name or "nothing to change" needs no confirmation.
                    results[call["id"]] = preview
                    del prepared[call["id"]]

        # 2. One pause for everything that needs approval. The graph stops here until the user answers.
        approved = True
        if waiting:
            decision = interrupt({"items": waiting})
            approved = isinstance(decision, dict) and decision.get("approved") is True

        # 3. Run what is left, in the order the model asked.
        messages = []
        for call in calls:
            if call["id"] in prepared:
                spec = specs_by_name[call["name"]]
                results[call["id"]] = CANCELLED if spec.confirm and not approved else context.api.call_tool(spec.name, prepared[call["id"]], context.token)
            messages.append(ToolMessage(content=json.dumps(results[call["id"]], ensure_ascii=False), name=call["name"], tool_call_id=call["id"]))
        return {"messages": messages}

    graph = StateGraph(MessagesState)
    graph.add_node("model", call_model)
    graph.add_node("tools", run_tools)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", tools_condition)
    graph.add_edge("tools", "model")
    return graph.compile(checkpointer=checkpointer)
