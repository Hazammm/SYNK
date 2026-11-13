"""The tools the model can call.

Adding a tool takes one ToolSpec here (its name, description and arguments) and
one executor with the same name on the Next.js side. The graph does not change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, ValidationError

from .synk_api import SynkApi, failure


@dataclass(frozen=True)
class RunContext:
    """Per-request values the tools need but the model must never see or choose.

    It travels in the run's config as an object, so LangGraph does not copy it
    into the saved conversation state.
    """

    api: SynkApi
    token: str
    system_prompt: str


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    args: type[BaseModel]
    # Tools that change existing data show a preview and wait for the user's approval.
    confirm: bool = False


class CreateTicketArgs(BaseModel):
    title: str = Field(description="Short title for the ticket.")
    project: str | None = Field(None, description="Project name or key, for example SYN. Leave out when the workspace has one project.")
    description: str | None = Field(None, description="Longer details, steps or acceptance criteria.")
    priority: Literal["low", "medium", "high"] | None = Field(None, description="Defaults to medium.")
    assignee: str | None = Field(None, description='Name of the person to assign, exactly as the user gave it, or "me" for the user.')
    status: str | None = Field(None, description="Board column to start in, for example In Progress. Defaults to the first column.")
    sprint: str | None = Field(None, description="Name of an open sprint to add the ticket to.")
    due_date: str | None = Field(None, description="Due date as YYYY-MM-DD.")


class UpdateTicketArgs(BaseModel):
    ticket: str = Field(description="Ticket key, for example SYN-12. Use find_tickets first if the user did not give a key.")
    title: str | None = Field(None, description="New title.")
    description: str | None = Field(None, description="New description.")
    priority: Literal["low", "medium", "high"] | None = None
    status: str | None = Field(None, description="Board column to move the ticket to, for example Done.")
    assignee: str | None = Field(None, description='Name of the new assignee, "me" for the user, or "none" to unassign.')
    sprint: str | None = Field(None, description='Name of an open sprint, or "none" to move the ticket to the backlog.')
    due_date: str | None = Field(None, description='New due date as YYYY-MM-DD, or "none" to clear it.')


class FindTicketsArgs(BaseModel):
    query: str | None = Field(None, description="Words from the ticket title or description, or a ticket key.")
    project: str | None = Field(None, description="Project name or key to search in.")
    assignee: str | None = Field(None, description='Assignee name, "me" for the user, or "unassigned".')
    status: str | None = Field(None, description="Board column name, for example In Progress.")


TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        name="create_ticket",
        description="Create a new ticket on a project board. Use when the user asks to create a task, bug, story or issue.",
        args=CreateTicketArgs,
    ),
    ToolSpec(
        name="update_ticket",
        description=(
            "Change an existing ticket: its title, description, priority, status, assignee, sprint or due date. "
            "The user is shown the change and must approve it before it is saved."
        ),
        args=UpdateTicketArgs,
        confirm=True,
    ),
    ToolSpec(
        name="find_tickets",
        description="Look up tickets the user can see. Use it to find a ticket's key before updating it, or to answer questions about tickets.",
        args=FindTicketsArgs,
    ),
]

CANCELLED = failure("cancelled", "The user cancelled this change. Nothing was changed.")


def _run_in_graph(**kwargs: Any) -> str:
    raise RuntimeError("Synk tools are run by the graph's tools node, which adds the user's token and the confirmation step.")


def tool_schemas(specs: list[ToolSpec] | None = None) -> list[StructuredTool]:
    """What the model is told about each tool: its name, description and arguments."""
    return [
        StructuredTool.from_function(func=_run_in_graph, name=spec.name, description=spec.description, args_schema=spec.args)
        for spec in (TOOL_SPECS if specs is None else specs)
    ]


def clean_args(spec: ToolSpec, raw: Any) -> dict[str, Any] | str:
    """Validates the model's arguments. Returns them without empty values, or a message saying what is wrong."""
    try:
        parsed = spec.args.model_validate(raw if isinstance(raw, dict) else {})
    except ValidationError as error:
        first = error.errors()[0]
        return f"{'.'.join(str(part) for part in first['loc']) or 'arguments'}: {first['msg']}"
    return {key: value for key, value in parsed.model_dump().items() if value is not None}
