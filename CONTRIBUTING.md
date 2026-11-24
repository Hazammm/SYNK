# Contributing to Synk

Thanks for helping. This guide covers how to set up the project, the rules the code follows, and how to get a change merged.

## Set up

1. Install Node.js 22, Docker Desktop and Git.
2. Fork the repository and clone your fork.
3. Follow the [Quickstart in the README](README.md#quickstart) to create `.env`, start PostgreSQL and run the app.
4. [docs/setup.md](docs/setup.md) explains every environment variable, email, OAuth sign-in and seed data.

Never commit `.env` or any real secret. Use `.env.example` for new settings, with a placeholder value.

## Make a change

1. Create a branch from `main` named after the change, for example `feat/poll-results` or `fix/login-redirect`.
2. Keep each commit small and about one thing. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), with a short summary in plain words:
   - `feat(chat): show who reacted to a message`
   - `fix(tickets): open a linked ticket on a board that is already open`
   - `docs: explain the invite flow`
3. Open an issue first for large changes, so we can agree on the approach before you write code.

## Code rules

- **Next.js 16.** This version differs from older docs. Read the guide in `node_modules/next/dist/docs/` before changing routing or data fetching (see [AGENTS.md](AGENTS.md)).
- **Permissions.** Every access check goes through `src/lib/permissions.ts` (`can()`, `requireWorkspace`, `requireChannel`, `requireProject`). Something a person cannot see returns "not found", not "forbidden".
- **Validation.** Validate input with the Zod schemas in `src/lib/validation.ts` at every route and socket handler.
- **Real-time.** Publish socket events only after the database write has committed.
- **Styling.** Use the CSS modules and the design tokens in `src/app/globals.css`. Inline `style` is only for values computed from data.
- **Accessibility.** Follow the rules in [docs/design/design-system.md](docs/design/design-system.md#interaction-and-accessibility-rules) and [ACCESSIBILITY.md](ACCESSIBILITY.md). Use the shared `Modal` for dialogs, label every icon button, and keep text at 12px or larger.
- **Simple first.** Reuse what already exists before adding a new helper or dependency.

## Test before you open a pull request

Integration, coverage and browser tests need a throwaway database in `TEST_DATABASE_URL` (see [docs/setup.md](docs/setup.md)).

```bash
npx eslint src tests scripts      # lint
npx tsc --noEmit -p .             # type check
npm test                          # unit tests
npm run test:coverage             # unit and integration tests, fails below 80% coverage
npm run build                     # production build
npm run test:e2e                  # browser tests (Playwright)
```

Add tests for new behaviour. A new route or permission rule needs an integration test that includes at least one denied case. A new screen needs a browser test.

## Open a pull request

- Target `main` and fill in the pull request template.
- Keep the summary to five bullet points or fewer.
- Add screenshots for visual changes, at desktop and phone width.
- CI (`.github/workflows/chat-ci.yml`) must pass before merging.
- Pull requests are merged with a regular merge commit, not squashed.

## Reporting bugs and ideas

Use the issue templates for [bug reports](../../issues/new?template=bug_report.yml) and [feature requests](../../issues/new?template=feature_request.yml). Report security problems privately, as described in [SECURITY.md](SECURITY.md).

By taking part, you agree to follow our [Code of conduct](CODE_OF_CONDUCT.md).
