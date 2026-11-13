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
