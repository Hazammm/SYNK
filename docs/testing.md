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
| Test coverage: at least 80% on the permission module, 60% overall | **Permission module 100%; server code 83.8% of lines** | `npm run test:coverage` |

## Test suites

| Suite | Tests | Command |
|---|---:|---|
| Unit | 39 | `npm test` |
| Integration (PostgreSQL) | 106, in 9 files | `npm run test:integration` |
| End-to-end (Playwright, production build) | 8 | `npm run test:e2e` |
| Agent (pytest, scripted model) | 46 | `npm run agent:test` |
| Agent accuracy (real model) | 30 prompts | `npm run agent:eval` |

CI runs the unit and integration tests together with coverage (`npm run test:coverage`), then the end-to-end tests, on every pull request.
