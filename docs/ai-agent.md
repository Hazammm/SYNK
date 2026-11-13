# AI agent

This covers PRD section 6.6: the agent graph, all four tools in the PRD (`create_ticket`, `update_ticket`, `create_doc`, `search_workspace`), permission enforcement and the confirmation flow. See [docs-module.md](docs-module.md) for the docs feature behind `create_doc`.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| FR-AI1 | An **Ask Synk AI** button on every screen opens a side panel. The panel returns to your last conversation in each workspace. |
| FR-AI2 | All four PRD tools are implemented, plus `find_tickets`, a read-only lookup the model uses to turn "the login ticket" into a key. The PRD's 30-prompt accuracy set is in `agent/evals`; see [ai-agent-eval.md](ai-agent-eval.md) for results. |
| FR-AI3 | Every tool runs on the Next.js server as the signed-in person, through the same services and `can()` check as their own requests. A denial is returned to the model, which explains it. |
| FR-AI4 | An unclear project, person, status or sprint name is returned as `ambiguous` with the candidates, and the model asks which one. Names are never guessed. |
| FR-AI5 | `update_ticket` is previewed first. The person sees each field's old and new value and must confirm before anything is saved. |
| FR-AI6 | Each reply carries an "actions taken" list: the tool, whether it worked, a summary and a link to the ticket. |
| FR-AI7 | Conversations are stored per person and workspace, with a history list. |
| FR-AI8 | A new tool is one `ToolSpec` in the agent and one entry in `agentTools` on the server. The graph does not change. |

## How a message travels

```
Browser ── POST /api/ai-agent/chat ──▶ Next.js ── POST /chat ──▶ agent (Python, LangGraph)
                                          ▲                          │
                                          └── POST /api/agent-tools/<name> ──┘
```

1. The browser sends the message to Next.js, which checks the session and saves the message.
2. Next.js builds a description of what this person can see (projects, statuses, people, sprints), mints a token for them, and calls the agent service.
3. The agent runs the LangGraph loop: the model decides which tools to call.
4. Each tool call goes back to Next.js with the person's token. Next.js checks the token and the person's permissions, runs the tool, and writes an `ActionLog` row.
5. The agent returns the reply, the actions taken and any change waiting for confirmation. Next.js saves and returns them.

## The graph

`agent/synk_agent/graph.py` is a two-node loop:

```
START → model → (tool calls?) → tools → model → … → END
```

- **model** calls the LLM with the system prompt and the recent conversation.
- **tools** checks each call's arguments, previews the calls that change existing data, pauses once for approval if any need it, then runs them in order.

The pause uses LangGraph's `interrupt`. Nothing is changed before it, because resuming re-runs the node from the top. Approving or cancelling resumes the graph with the answer.

Conversation memory for the model is kept by a LangGraph checkpointer in a SQLite file inside the agent's data volume. The readable transcript lives in PostgreSQL (`Conversation`, `ConversationMessage`). If the SQLite file is lost, transcripts stay but the model forgets earlier turns.

## Security model

- **The agent has no access of its own.** It cannot reach the database and is not given `NEXTAUTH_SECRET`. It can only call the tool endpoints.
- **Per-request user tokens.** Next.js signs a token naming one person, workspace and conversation, valid for five minutes. Only Next.js can sign one, so the agent cannot act as anyone else. The token is never shown to the model and never written to the agent's storage.
- **Service secret.** The agent only accepts requests carrying `AI_SERVICE_SECRET`, so only the Next.js server can start a turn.
- **Same permissions as the person.** Tools go through the existing services. A ticket or project the person cannot open looks the same as one that does not exist.
- **Confirmation for changes.** Anything that modifies existing data waits for approval. A new message cannot be sent while a change is waiting, and a double click cannot approve twice.
- **Audit trail.** `ActionLog` records every tool run, preview and denial with the person, tool, parameters and result.
- **Prompt injection.** Ticket text and tool results are passed to the model as data, and the prompt tells it not to follow instructions found there. This reduces the risk but does not remove it; the permission checks and the confirmation step are what limit the damage.

## Tools

| Tool | Changes data | Needs confirmation | Notes |
| --- | --- | --- | --- |
| `create_ticket` | Yes | No | Project, status, assignee and sprint are given by name. "me" assigns to the caller. |
| `update_ticket` | Yes | Yes | Takes a ticket key. "none" clears the assignee, sprint or due date. |
| `find_tickets` | No | No | Searches titles and descriptions in projects the caller can open; at most 10 results. |
| `create_doc` | Yes | No | Creates a page, optionally under a parent page given by title. |
| `search_workspace` | No | No | Searches tickets, pages and messages from channels the caller has joined. |

### Adding a tool

1. In `agent/synk_agent/tools.py`, add a Pydantic model for the arguments and a `ToolSpec` with the name, description and `confirm=True` if it changes existing data.
2. In `src/features/agent/tools.ts`, add an entry to `agentTools` with the same name: a Zod schema and a `run` function that calls the existing services. Return a preview for the dry run if the tool needs confirmation.
3. Add tests on both sides.

## Running it

The agent runs in Docker, next to PostgreSQL:

```bash
npm run agent:up      # build and start the agent on http://127.0.0.1:8000
npm run agent:test    # run the agent's tests
npm run agent:eval    # run the 30-prompt accuracy evaluation against the real model
```

Settings, all in `.env`:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `AI_SERVICE_URL` | Next.js | Where the agent listens, normally `http://127.0.0.1:8000`. Without it the panel says the assistant is not set up. |
| `AI_SERVICE_SECRET` | Both | Shared secret, at least 32 characters. |
| `LLM_MODEL` | Agent | `<provider>:<model>`. Defaults to `google_genai:gemini-3.5-flash`. |
| `GOOGLE_API_KEY` | Agent | Key from Google AI Studio for the default provider. |
| `NEXTJS_API_URL` | Agent | Where the agent reaches Next.js. Defaults to the host machine from inside Docker. |

To use another provider, install its LangChain package in `agent/pyproject.toml`, set `LLM_MODEL` (for example `groq:llama-3.3-70b-versatile` or `ollama:qwen3`) and pass its API key to the `agent` service in `compose.yaml`.

On Windows with Smart App Control turned on, the agent's compiled Python dependencies are blocked from loading, which is why the agent is run in Docker rather than directly on the machine.

## Tests

- `agent/tests/`: the graph with a scripted model and a fake Synk API, covering create, denial, confirmation, cancelling, several changes in one turn, provider errors, step limits and that tokens are never stored.
- `tests/agent.integration.test.mts`: the tool executors against PostgreSQL (permissions, unclear names, previews), token checks on the tool endpoint, and conversations with a stand-in agent.
- `tests/unit.test.ts`: tokens, name matching and chat validation.
- `tests/e2e/agent.spec.ts`: the panel in a browser, without calling a model.

A live run against Gemini was done by hand: creating a ticket, updating one with confirmation, a denial, an ambiguous name and a cancelled change.

## Not done yet

- A complete accuracy run: the first runs were cut short by free-tier limits (see [ai-agent-eval.md](ai-agent-eval.md)).
- Streaming replies; the panel waits for the whole answer.
- Free model tiers have tight limits. When the quota runs out the assistant says so and the conversation can continue later.
