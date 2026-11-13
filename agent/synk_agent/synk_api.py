"""HTTP client for the Synk tool endpoints.

Every tool the agent can use is executed by the Next.js server, which checks the
user's permissions. This client only forwards the call with the user's token.
"""

from __future__ import annotations

from typing import Any

import httpx


def failure(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "code": code, "message": message}


class SynkApi:
    def __init__(self, base_url: str, timeout: float = 20.0, transport: httpx.BaseTransport | None = None) -> None:
        self._client = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout, transport=transport)

    def call_tool(self, name: str, args: dict[str, Any], token: str, dry_run: bool = False) -> dict[str, Any]:
        """Runs one tool as the user the token belongs to.

        Always returns a result dictionary. Problems reaching Synk become failures
        the model can explain, so a network error never looks like a successful change.
        """
        try:
            response = self._client.post(
                f"/api/agent-tools/{name}",
                json={"args": args, "dryRun": dry_run},
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.HTTPError:
            return failure("unavailable", "Synk could not be reached, so nothing was changed.")
        if response.status_code == 401:
            return failure("expired", "Permission for this request has expired, so nothing was changed. Ask the user to send the request again.")
        if response.status_code >= 400:
            return failure("unavailable", "Synk could not complete that step, so nothing was changed.")
        try:
            body = response.json()
        except ValueError:
            body = None
        if not isinstance(body, dict) or not isinstance(body.get("ok"), bool):
            return failure("unavailable", "Synk sent an answer that could not be read, so treat this step as not done.")
        return body

    def close(self) -> None:
        self._client.close()
