# SYNK

AI-powered team workspace. It implements the PRD's **critical-path chat module**, **issue tracking with sprint reports**, **docs**, **time tracking**, the **AI agent**, and the authentication, membership and database foundation they require.

## What is functional

- Invite-only email/password authentication with NextAuth v4 JWT sessions in HTTP-only cookies and revocable login records. There is no public sign-up endpoint.
- Workspace creation establishes the creator as ADMIN, along with a starter project and general channel, in one database transaction.
- Workspace admins can send seven-day, single-use, hashed-token invitations through Mailtrap. Existing accounts sign in to accept; new invitees create an account when joining.
- Settings > Members shows workspace roles and pending invites. Only admins can invite, resend, revoke, or remove members.
- Public and private channels, joining, member management, persistent messages and one-level threads.
- REST history with cursor pagination and Socket.IO live delivery. Reconnect reloads the newest page; older history remains available through pagination.
- Shared access checks. Workspace membership is required, and channel membership is separately required for reading, writing and subscribing. Admins do not bypass channel membership.
- Retry-safe message creation using a client UUID, plus UI deduplication of REST and socket responses.
- Ticket-key links such as `SYN-101` in chat open the ticket on its board, if the reader has access to its project.
- Projects with read or edit access per person, boards with configurable columns, and tickets with drag and drop, filters, comments, @mentions and deletion.
- Sprints with progress, and a Reports view with a burndown, velocity, breakdowns and CSV export.
- An overview of your open tickets and active sprints, and in-app alerts for assignments, comments and mentions.
- A profile menu and **Settings**: display name, which alerts you get, theme, password changes, signing out other devices, leaving a workspace and deleting your AI conversations.
- **Docs**: nested pages per project written in Markdown, with a formatting toolbar, preview, checklists, edit-conflict protection and full-text search.
- **Time tracking**: timers started from the Time page or a ticket, time added by hand, and a weekly report by day, ticket and person with CSV export.
- **Synk AI**, an assistant on every screen that creates, finds and updates tickets, writes pages and searches the workspace in plain language. It can only do what you are allowed to do, asks which one you mean when a name is unclear, and waits for your confirmation before changing an existing ticket.

See [issue tracking notes](docs/issue-tracking.md) for requirement coverage, the access model and how reports are calculated, [docs notes](docs/docs-module.md) for how pages work, [time tracking notes](docs/time-tracking.md) for timers and reports, and [AI agent notes](docs/ai-agent.md) for how the agent works and how to add a tool.

## Local setup

Requirements: Node.js 22.12+ (Node 24 also supported), npm, and PostgreSQL. Docker Compose is optional for a local database.

```bash
npm ci
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Paste the generated value into NEXTAUTH_SECRET in .env.
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and choose **New to Synk? Create a workspace**. The creator becomes the workspace admin. To email invitations, configure the Mailtrap variables in `.env`; invitees join from the link and can then sign in and join public channels. Admins can manage invitations and members under **Settings → Members**.

The Compose database binds to IPv4, so use `127.0.0.1` in `DATABASE_URL`; on Windows, `localhost` may attempt IPv6 first and exceed Prisma transaction startup timeouts. This database address is separate from the browser origin, which remains `http://localhost:3000`.

Use your own PostgreSQL `DATABASE_URL` if not using Compose. The Compose password is a local-development value only. `NEXTAUTH_URL` must match the browser's origin exactly, including its port. Do not alternate between `localhost` and `127.0.0.1`.

### Mailtrap email

For live delivery, set `MAILTRAP_API_TOKEN` and `MAIL_FROM` in `.env`. Use a Mailtrap Email Sending API token and a sender address/domain verified in Mailtrap; API-token delivery takes precedence when both API and SMTP settings are present. Alternatively, configure `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS`, and `MAIL_FROM` to use SMTP. In development, password-reset links are printed to the server console when Mailtrap is not configured; account creation still succeeds if a welcome email cannot be delivered. A Mailtrap Email Testing inbox captures messages for inspection but does not deliver them to the recipient's real mailbox. Invitation tokens are stored only as SHA-256 hashes and expire after seven days.

### Optional AI agent

The assistant runs as a separate Python (LangGraph) service in Docker. Create a free key in [Google AI Studio](https://aistudio.google.com/apikey), then add these to `.env`:

```bash
AI_SERVICE_URL="http://127.0.0.1:8000"
AI_SERVICE_SECRET=""   # generate like NEXTAUTH_SECRET
GOOGLE_API_KEY=""
```

```bash
npm run agent:up
```

Without these settings the rest of Synk works normally and the panel says the assistant is not set up. `npm run agent:test` runs the agent's own tests, and `npm run agent:eval` runs the 30-prompt accuracy evaluation against the real model (see [the evaluation notes](docs/ai-agent-eval.md)).

### Optional demo records

Set `SEED_DEMO_PASSWORD` in `.env` (at least 10 characters and at most 72 UTF-8 bytes), then run:

```bash
npm run db:seed
```

Accounts: `admin@synk.test`, `member@synk.test`, `outsider@synk.test`. The first two share a workspace and project; the third belongs to a different workspace. `SYN-101` is a real seeded ticket, and a running `Sprint 4` with finished and open tickets gives the reports and overview something to show. Seeding is opt-in, idempotent, does not overwrite existing passwords and refuses production mode.

### Google sign-in (optional)

Google sign-in is enabled when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env`. To configure local development:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or select a project and configure the OAuth consent screen. Add your Google account as a test user if the app is in testing mode.
2. Create an OAuth client ID with application type **Web application**.
3. Add `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
4. Put the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart the dev server.

The Google button appears on `/login` after both values are configured. New Google users can create a workspace or accept an invitation sent to their verified Google email. Existing accounts with the same verified email can sign in with Google. For production, add the production origin and callback URL to the OAuth client and configure the same environment variables on the server. Keep the client secret private and never commit `.env`.

Email/password login works without Google credentials.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Integration tests need a **disposable, migrated PostgreSQL database**. They create isolated test fixtures and clean up their own records; do not use a production database.

```bash
# macOS/Linux: set both variables to the disposable database
export DATABASE_URL='postgresql://synk:synk_local_only@127.0.0.1:5432/synk_test'
export TEST_DATABASE_URL="$DATABASE_URL"
npm run db:migrate
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

PowerShell environment variables use `$env:DATABASE_URL = '...'` and `$env:TEST_DATABASE_URL = $env:DATABASE_URL`. Browser tests start the development server automatically unless an existing local server is available. For production browser checks, run `npm run build` first and set `E2E_SERVER_COMMAND="npm start"` (PowerShell: `$env:E2E_SERVER_COMMAND = "npm start"`) before `npm run test:e2e`; CI uses this mode. `npm start` also requires the Mailtrap environment variables; placeholder values are fine here because the browser tests do not require successful email delivery. Keep `DATABASE_URL` pointed at the disposable test database for the server as well as the tests. They create accounts/workspaces in that database. See [the QA plan](docs/chat-qa.md) for test cases and [implementation notes](docs/chat-implementation.md) for scope and API contracts.

## Production runtime

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm start
```

Run the **custom Node server**, not `next start`. It hosts Next.js and Socket.IO in the same process and shares the authenticated permission layer. Use a persistent Node host with PostgreSQL and HTTPS, with the reverse proxy forwarding WebSocket upgrades. Set `TRUSTED_PROXY_IPS` to the exact addresses of your proxies so rate limits apply per client; each proxy must append to `X-Forwarded-For`, which is ignored on connections from any other address. A serverless-only deployment cannot run this custom socket server.

This version supports one Node instance. Before scaling to multiple instances, add a Socket.IO adapter, shared rate limiting and cross-instance revocation. Message persistence is authoritative; if the process fails after a commit but before publication, reconnect/history recovers the message. Delivery is not an exactly-once transport guarantee.

Secrets belong only in environment variables. NextAuth JWT cookies use secure flags when `NEXTAUTH_URL` is HTTPS. Login records provide a seven-day absolute session lifetime and revocation on sign-out. Remove expired `LoginSession` rows periodically as routine database maintenance. Account deletion is not implemented.

### Password reset

**Forgot password?** on the login page requests a single-use link that expires after 15 minutes. Each account receives at most one email every 5 minutes, and earlier links keep working until they expire or a reset succeeds. Only a SHA-256 hash of the token is stored. A successful reset changes the password, invalidates every reset link and signs the user out everywhere, including live chat sockets. The response is identical whether or not the email exists, and the account is processed after the response is sent. Accounts that only use OAuth do not receive links.

Production requires either `MAILTRAP_API_TOKEN` and `MAIL_FROM`, or the Mailtrap SMTP settings and `MAIL_FROM`: `npm start` refuses to run without email delivery configuration. In development, leaving Mailtrap unset prints password-reset links to the server console; welcome-email failures are reported after signup without rolling back the new account.
