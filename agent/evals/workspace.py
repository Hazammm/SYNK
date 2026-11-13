"""A small, fixed workspace for the evaluation, served by a rules-based stand-in for Synk.

The stand-in answers tool calls the way the real Next.js tools do (resolving names, refusing
view-only projects, reporting ambiguity), so the evaluation measures the model's decisions
without needing a database.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from synk_agent.synk_api import SynkApi

USER = "Asra Khan"
MEMBERS = ["Asra Khan", "Sarah Khan", "Sarah Ali", "Bilal Ahmed"]
STATUSES = ["To Do", "In Progress", "Review", "Done"]
SPRINTS = ["Sprint 5"]
PAGES = ["Project brief", "Design brief", "Auth design spec"]

# key -> ticket. MKT is a view-only project; there is also a "Secret" project the user cannot see.
TICKETS: dict[str, dict[str, Any]] = {
    "SYN-12": {"title": "Login page crashes on submit", "status": "To Do", "priority": "High", "assignee": "Asra Khan"},
    "SYN-14": {"title": "Dark mode toggle ignores the system setting", "status": "In Progress", "priority": "Medium", "assignee": None},
    "SYN-20": {"title": "Write API documentation", "status": "To Do", "priority": "Low", "assignee": None},
    "SYN-21": {"title": "Login rate limit is too strict", "status": "To Do", "priority": "Medium", "assignee": "Sarah Ali"},
    "SYN-30": {"title": "Set up continuous integration", "status": "Done", "priority": "Medium", "assignee": "Bilal Ahmed"},
    "MKT-3": {"title": "Fix the footer links", "status": "To Do", "priority": "Low", "assignee": None},
}

CONTEXT = {
    "today": "2026-11-13",
    "user": {"name": USER},
    "workspace": {"name": "Synk FYP", "role": "member"},
    "projects": [
        {"key": "SYN", "name": "FYP", "access": "edit", "boards": [{"name": "Main board", "statuses": STATUSES}],
         "members": MEMBERS, "sprints": [{"name": "Sprint 5", "state": "active"}], "pages": PAGES},
        {"key": "MKT", "name": "Marketing site", "access": "view", "boards": [{"name": "Main board", "statuses": STATUSES}],
         "members": ["Bilal Ahmed"], "sprints": [], "pages": []},
    ],
}


def failure(code: str, message: str, candidates: list[str] | None = None) -> dict[str, Any]:
    return {"ok": False, "code": code, "message": message, **({"candidates": candidates} if candidates else {})}


class Unresolved(Exception):
    def __init__(self, result: dict[str, Any]) -> None:
        super().__init__(result["message"])
        self.result = result


def match(names: list[str], query: str, what: str) -> str:
    """Resolves a name like the real tools: exact, then whole word, then prefix, then fragment."""
    wanted = " ".join(query.lower().split())
    rules = [lambda name: name == wanted, lambda name: wanted in name.split(), lambda name: name.startswith(wanted), lambda name: wanted in name]
    for rule in rules:
        hits = [name for name in names if rule(name.lower())]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            raise Unresolved(failure("ambiguous", f"More than one {what} matches “{query}”.", hits))
    raise Unresolved(failure("not_found", f"There is no {what} called “{query}”.", names))


def project_of(name: str | None) -> str:
    if not name:
        return "SYN"
    lowered = name.lower()
    if lowered in ("syn", "fyp") or "fyp" in lowered:
        return "SYN"
    if lowered == "mkt" or "marketing" in lowered:
        return "MKT"
    raise Unresolved(failure("not_found", f"I couldn't find a project called “{name}” that you can open.", ["FYP (SYN)", "Marketing site (MKT)"]))


def person(value: str) -> str | None:
    lowered = value.strip().lower()
    if lowered in ("me", "myself", "i"):
        return USER
    if lowered in ("none", "nobody", "no one", "unassigned"):
        return None
    return match(MEMBERS, value, "person")


def view_only(project: str) -> None:
    if project == "MKT":
        raise Unresolved(failure("forbidden", "You have view-only access to Marketing site, so I can't change it."))


def create_ticket(args: dict[str, Any], dry_run: bool) -> dict[str, Any]:
    project = project_of(args.get("project"))
    view_only(project)
    details = [match(STATUSES, args["status"], "status") if args.get("status") else "To Do"]
    if args.get("assignee"):
        details.append(f"assigned to {person(args['assignee'])}")
    if args.get("sprint"):
        details.append(f"in {match(SPRINTS, args['sprint'], 'open sprint')}")
    return {"ok": True, "summary": f"Created SYN-40 “{args['title']}” in {', '.join(details)}."}


def update_ticket(args: dict[str, Any], dry_run: bool) -> dict[str, Any]:
    key = str(args["ticket"]).upper()
    ticket = TICKETS.get(key)
    if not ticket:
        return failure("not_found", f"I couldn't find {key} in this workspace, or you don't have access to it.")
    view_only(key.split("-")[0])
    changes = []
    if args.get("status"):
        status = match(STATUSES, args["status"], "status")
        if status != ticket["status"]:
            changes.append({"field": "Status", "from": ticket["status"], "to": status})
    if args.get("priority") and args["priority"].capitalize() != ticket["priority"]:
        changes.append({"field": "Priority", "from": ticket["priority"], "to": args["priority"].capitalize()})
    if args.get("assignee"):
        assignee = person(args["assignee"])
        if assignee != ticket["assignee"]:
            changes.append({"field": "Assignee", "from": ticket["assignee"] or "Unassigned", "to": assignee or "Unassigned"})
    for field in ("title", "description", "due_date", "sprint"):
        if args.get(field):
            changes.append({"field": field.replace("_", " ").capitalize(), "from": "(old)", "to": args[field]})
    if not changes:
        return {"ok": True, "summary": f"{key} already has those values, so nothing was changed."}
    summary = "; ".join(f"{change['field'].lower()} {change['from']} → {change['to']}" for change in changes)
    if dry_run:
        return {"ok": True, "summary": f"Update {key}: {summary}.", "preview": {"changes": changes}}
    return {"ok": True, "summary": f"Updated {key}: {summary}."}


def find_tickets(args: dict[str, Any], dry_run: bool) -> dict[str, Any]:
    rows = [{"key": key, **ticket} for key, ticket in TICKETS.items() if key.startswith("SYN")]
    query = (args.get("query") or "").lower()
    if query:
        if query.upper() in TICKETS:
            rows = [{"key": query.upper(), **TICKETS[query.upper()]}]
        else:
            # Each word must appear, allowing simple endings ("dark mode" finds "Dark mode toggle").
            words = [word.rstrip("s") for word in query.split() if len(word) > 2 and word not in ("the", "ticket", "tickets")]
            rows = [row for row in rows if all(word in row["title"].lower() for word in words)]
    if args.get("assignee"):
        wanted = person(args["assignee"])
        rows = [row for row in rows if row["assignee"] == wanted]
    if args.get("status"):
        rows = [row for row in rows if row["status"].lower() == args["status"].lower()]
    return {"ok": True, "summary": f"Found {len(rows)} {'ticket' if len(rows) == 1 else 'tickets'}.", "data": {"tickets": rows}}


def create_doc(args: dict[str, Any], dry_run: bool) -> dict[str, Any]:
    project = project_of(args.get("project"))
    if project == "MKT":
        raise Unresolved(failure("forbidden", "You have view-only access to Marketing site, so I can't add pages to it."))
    where = f"under “{match(PAGES, args['parent'], 'page')}” in FYP" if args.get("parent") else "in FYP"
    return {"ok": True, "summary": f"Created the page “{args['title']}” {where}.", "target": {"type": "doc", "id": "d1", "title": args["title"], "projectId": "p1"}}
