# Testing and quality results

This page checks Synk against the quality targets in PRD section 15 and says how to repeat each measurement. The numbers are from 15 November 2026, measured on a Windows laptop with PostgreSQL in Docker.

## Results against the PRD targets

| Target (PRD section 15) | Result | How it is measured |
|---|---|---|
| AI tool coverage: 4 of 4 tools working end to end | 5 tools (the PRD's 4 plus `find_tickets`) | Agent tests and `tests/agent.integration.test.mts` |
| Tool-call accuracy: at least 90% on 30 prompts | **30/30 (100%)** | `npm run agent:eval`; see [ai-agent-eval.md](ai-agent-eval.md) |
| Permission enforcement: 100% of at least 10 denial cases blocked | **20 of 20 blocked, nothing changed** | `tests/denials.integration.test.mts` |
| Chat delivery under 1 second | **367 ms**, from typing to the other person seeing it | `tests/e2e/chat.spec.mts` prints the time |
| Sign-up to first AI-created ticket under 5 minutes | **5.5 s** scripted (a person typing takes longer) | `npm run test:walkthrough` |
| API p95 under 500 ms | **Slowest p95: 299 ms** | `npm run test:load` |
| Test coverage: at least 80% on the permission module, 60% overall | **Permission module 100%; server code 89.4% of lines** | `npm run test:coverage` |

## Test suites

| Suite | Tests | Command |
|---|---:|---|
| Unit | 58 | `npm test` |
| Integration (PostgreSQL) | 128, in 12 files | `npm run test:integration` |
| End-to-end (Playwright, production build) | 12 | `npm run test:e2e` |
| Agent (pytest, scripted model) | 46 | `npm run agent:test` |
| Agent accuracy (real model) | 30 prompts | `npm run agent:eval` |

CI runs the unit and integration tests together with coverage (`npm run test:coverage`), then the end-to-end tests, on every pull request.

## Coverage

`npm run test:coverage` runs the unit and integration tests with Node's built-in coverage and fails if less than 80% of the lines in server code are run. Server code means every `.ts` file in `src` outside `src/app`: services, permissions, validation, the socket server and libraries. Pages, route files and React components are covered by the end-to-end tests instead, which do not report coverage.

| Scope | Lines | Branches | Functions |
|---|---:|---:|---:|
| Permission module (`src/lib/permissions.ts`) | 100% | 97.1% | 100% |
| All server code | 89.4% | 91.3% | 95.3% |

The command prints the figures for every file. The least covered file is `src/lib/mailer.ts`, because the tests never send real email.

## Permission-denial suite

[`tests/denials.integration.test.mts`](../tests/denials.integration.test.mts) collects the denial cases in one place. Four people take part: an admin, a workspace member with no project access, a member who can only view the project, and someone from another workspace. Every attempt must be refused with "forbidden" or "not found", and a final test checks that nothing changed.

1. An outsider reads a channel's history.
2. An outsider posts in a channel.
3. A member joins a private channel they were not added to.
4. A member reads a private channel's history.
5. A member without project access opens a ticket.
6. A viewer edits a ticket.
7. A viewer deletes a ticket.
8. A viewer creates a ticket.
9. A member without project access reads a page.
10. A viewer edits a page.
11. A viewer logs time on a ticket.
12. A member without project access reads the sprint reports.
13. A member creates a project.
14. A member gives themselves project access.
15. A member removes the admin from the workspace.
16. A member sends workspace invites.
17. An outsider opens another workspace's overview.
18. A member links a repository to a project.
19. The AI agent, acting for each of them, tries to create and change tickets and pages it may not (4 attempts).
20. A webhook signed with the wrong secret tries to change pull requests.

Other suites test more denial cases next to the features they protect, for example the socket tests for live chat.

## Performance

`npm run test:load` signs in as the demo admin and sends 200 requests to each read endpoint and 50 to each write endpoint, 10 at a time, against `npm start`.

| Endpoint | p50 (ms) | p95 (ms) | Max (ms) |
|---|---:|---:|---:|
| GET /api/me | 85 | 146 | 2178 (first request, server warming up) |
| GET /api/workspaces | 79 | 96 | 102 |
| GET /api/workspaces/:id/projects | 102 | 119 | 130 |
| GET /api/projects/:id | 125 | 169 | 212 |
| GET /api/tickets?boardId= | 117 | 145 | 175 |
| GET /api/channels/:id/messages | 99 | 137 | 172 |
| GET /api/notifications | 93 | 180 | 232 |
| GET /api/workspaces/:id/overview | 158 | 214 | 265 |
| POST /api/tickets | 186 | 299 | 318 |
| POST /api/channels/:id/messages | 139 | 186 | 211 |

No request failed. The script exits with an error if any p95 reaches 500 ms. It creates load-test tickets and messages, so run it against demo data, not real data.

`npm run test:walkthrough` drives a browser through the core flow with the real model: create an account and workspace, ask Synk AI to "Create a high priority ticket called Fix login bug", and find the ticket on the board.

| Step | Seconds since start |
|---|---:|
| Account and workspace created | 1.6 |
| Synk AI created the ticket | 5.0 |
| Ticket shows on the board | 5.5 |

## Running the measurements

The integration tests, coverage and end-to-end tests need a disposable database in `TEST_DATABASE_URL`; see [setup.md](setup.md). The load test and walkthrough need a running server:

```bash
npm run db:seed
npm run build
npm start
```

Then, in a second terminal, `npm run test:load` (with `SEED_DEMO_PASSWORD` set) or `npm run test:walkthrough` (with the agent running: `npm run agent:up`). If the server is not on port 3000, set `LOAD_BASE_URL`, and start the agent with `NEXTJS_API_URL=http://host.docker.internal:<port>`.

## Limits

- Coverage covers server code only. The interface is tested by the 12 end-to-end tests, which do not measure coverage.
- The load test runs on one laptop with 10 requests at a time. It shows the code is fast enough, not how a deployed server behaves under many users.
- On Windows with Docker, 3 concurrency tests (message retries, concurrent ticket keys and ticket moves) can time out waiting for a database connection. They pass in CI.
