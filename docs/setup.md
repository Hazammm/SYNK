# Setup, configuration and deployment

This guide covers everything needed to run, configure, test and deploy Synk. For an overview of the project, see the [README](../README.md).

## Prerequisites

- **Node.js 22.12 or later** and npm. CI tests on Node 22.
- **PostgreSQL.** The included `compose.yaml` runs PostgreSQL 16 in Docker. You can use your own server instead.
- **Docker.** Needed for the Compose database and for the optional AI agent.

## Local setup

```bash
npm ci
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Paste the output into NEXTAUTH_SECRET in .env.
docker compose up -d --wait postgres
npm run db:generate
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and choose **New to Synk? Create a workspace**. The person who creates a workspace becomes its admin. Admins manage invitations and members under **Settings > Members**. Sending invitations requires email delivery to be configured (see [Email delivery](#email-delivery-mailtrap)).

Development mode needs only `DATABASE_URL`, `NEXTAUTH_URL` and a `NEXTAUTH_SECRET` of at least 32 characters. The server refuses to start without them.

Two addresses must be set carefully, especially on Windows:

- **Use `127.0.0.1` in `DATABASE_URL`, not `localhost`.** The Compose database listens on IPv4 only (`127.0.0.1:5432`). On Windows, `localhost` may try IPv6 first, and the delay can make Prisma transactions time out when they start. The value in `.env.example` already uses `127.0.0.1`.
- **Port 5432 already taken?** Start the database on another port with `POSTGRES_PORT`, for example `POSTGRES_PORT=5434 docker compose up -d postgres` (PowerShell: `$env:POSTGRES_PORT=5434` first), and use that port in `DATABASE_URL`.
- **`NEXTAUTH_URL` must match the browser origin exactly, including the port.** It stays `http://localhost:3000`, separate from the database address. Browser writes (except Google invite acceptance, which relies on a SameSite=Lax profile cookie) and the Socket.IO server compare the `Origin` header against it. Do not switch between `localhost` and `127.0.0.1` in the browser.

The Compose database password (`synk_local_only`) is for local development only. If you use your own PostgreSQL, set its connection string in `DATABASE_URL`.

## Environment variables

Copy `.env.example` to `.env`. Never commit `.env`.

`.env.example` includes every variable below except `HOSTNAME_BIND` and `SEED_DEMO_PASSWORD`, which you add yourself when you need them. `TRUSTED_PROXY_IPS` and the AI variables (`AI_SERVICE_URL`, `AI_SERVICE_SECRET`, `LLM_MODEL`, `GOOGLE_API_KEY`) are present but commented out; uncomment them to use them.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. The default matches Compose. |
| `NEXTAUTH_URL` | Yes | The exact origin in the browser. Used for same-origin checks, the socket origin and links in emails. |
| `NEXTAUTH_SECRET` | Yes | Secret for signing and encrypting sessions, and for signing agent tokens. At least 32 characters. |
| `PORT` | No | HTTP port. Default `3000`. |
| `HOSTNAME_BIND` | No | Address to listen on. Default `0.0.0.0`. Read by `server.ts`. |
| `TEST_DATABASE_URL` | For integration and e2e tests | A disposable, migrated test database. The tests refuse to run without it. |
| `MAILTRAP_API_TOKEN` | Production (or the SMTP set) | Mailtrap Email Sending API token. Takes precedence over SMTP. |
| `MAIL_FROM` | With either email mode | Sender address, verified in Mailtrap. |
| `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS` | Instead of the API token | Mailtrap SMTP delivery. All four are required, with `MAIL_FROM`. There is no default port: `MAILTRAP_PORT` must be set (`.env.example` uses `2525`). Port `465` uses TLS. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No; set both or neither | Google sign-in. |
| `GITHUB_ID`, `GITHUB_SECRET` | No | GitHub sign-in, and linking GitHub repositories to projects. |
| `BITBUCKET_ID`, `BITBUCKET_SECRET` | No | Bitbucket sign-in, and linking Bitbucket repositories to projects. |
| `TRUSTED_PROXY_IPS` | Behind a reverse proxy | Comma-separated exact addresses of your proxies, so rate limits apply to each client rather than to the proxy. |
| `AI_SERVICE_URL` | For the AI agent | Where Next.js reaches the agent, for example `http://127.0.0.1:8000`. |
| `AI_SERVICE_SECRET` | For the AI agent | Bearer secret shared by both services. At least 32 characters. |
| `GOOGLE_API_KEY` | For the AI agent | Google AI Studio key for the default Gemini model. |
| `LLM_MODEL` | No | Model as `<provider>:<model>`. Default `google_genai:gemini-3.5-flash`. |
| `SEED_DEMO_PASSWORD` | Only for `npm run db:seed` | Password for the demo accounts. |

## Email delivery (Mailtrap)

Synk sends invitations, welcome emails and password-reset links through Mailtrap. Two modes are supported:

- **API (preferred):** set `MAILTRAP_API_TOKEN` and `MAIL_FROM`. Use a Mailtrap Email Sending API token and a sender address or domain verified in Mailtrap. If both API and SMTP settings are present, the API is used.
- **SMTP:** set `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS` and `MAIL_FROM`. All five are required; `MAILTRAP_PORT` must be a whole number from 1 to 65535.

How each environment behaves:

- **Production:** `npm start` refuses to run without one complete email configuration.
- **Development, password reset:** if email is not configured, the reset link is printed to the server console instead of being sent.
- **Invitations:** sending one always needs email configured, even in development. Without it the request fails with `503`.
- **Welcome emails:** if one cannot be delivered, the account is still created and the failure is reported after signup.

A Mailtrap Email Testing inbox captures messages for inspection but does not deliver them to real mailboxes.

## Sign-in providers

Email and password sign-in always works. Each OAuth button appears on `/login` only after both values of its pair are set. Restart the server after changing them.

The GitHub and Bitbucket apps also power repository linking, described under [GitHub and Bitbucket](#github-and-bitbucket).

### Google

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or select a project and configure the OAuth consent screen. If the app is in testing mode, add your Google account as a test user.
2. Create an OAuth client ID of type **Web application**.
3. Add `http://localhost:3000` as an authorized JavaScript origin, and `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
4. Put the values into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Setting only one of the two is a configuration error.

Unverified Google emails are rejected. An existing account with the same verified email signs in and is linked to Google. A new Google user can create a workspace, or accept a pending invitation sent to their Google email. For production, add the production origin and callback URL to the OAuth client.

### GitHub and Bitbucket

| Provider | Where to create the app | Callback URL (local) | Variables |
|---|---|---|---|
| GitHub | GitHub OAuth app | `http://localhost:3000/api/auth/callback/github` | `GITHUB_ID`, `GITHUB_SECRET` |
| Bitbucket | Bitbucket OAuth consumer with the `account` and `email` scopes | `http://localhost:3000/api/auth/callback/bitbucket` | `BITBUCKET_ID`, `BITBUCKET_SECRET` |

In production, replace `http://localhost:3000` with your `NEXTAUTH_URL`. Bitbucket sign-in requires a confirmed primary email on the account. A new user who signs in with GitHub or Bitbucket is taken to the workspace setup form.

The same two apps let workspace admins link repositories, so pull requests appear on tickets. For that, the Bitbucket consumer also needs the **Repositories: Read** and **Pull requests: Read** permissions. See [code-hosts.md](code-hosts.md).

## AI agent service (optional)

The agent is a separate Python LangGraph service that runs in Docker. Create a key in [Google AI Studio](https://aistudio.google.com/apikey), then add to `.env`:

```bash
AI_SERVICE_URL="http://127.0.0.1:8000"
AI_SERVICE_SECRET=""   # at least 32 characters; generate it like NEXTAUTH_SECRET
GOOGLE_API_KEY=""
```

```bash
npm run agent:up       # build and start the agent container
npm run agent:test     # agent tests with a scripted model; no API key needed
npm run agent:eval     # 30-prompt accuracy evaluation against the real model
```

Before the first evaluation, create its output folder: `mkdir -p agent/evals/results` (PowerShell: `New-Item -ItemType Directory -Force agent/evals/results`). The evaluation needs both `GOOGLE_API_KEY` and `AI_SERVICE_SECRET`, and writes `report.md` and `results.json` there.

The agent listens on `127.0.0.1:8000`. It receives only `AI_SERVICE_SECRET`, `GOOGLE_API_KEY`, `LLM_MODEL`, `NEXTJS_API_URL` and `AGENT_DATA_DIR`. It never receives the database URL or `NEXTAUTH_SECRET`. `NEXTJS_API_URL` defaults to `http://host.docker.internal:3000`, because the Next.js server runs on the host. Model memory is stored in the `synk_agent` Docker volume.

Without these settings, the rest of Synk works normally and the panel says the assistant is not set up. Free Gemini tiers cap daily requests, which can stop a full evaluation run. See [ai-agent.md](ai-agent.md) and [ai-agent-eval.md](ai-agent-eval.md).

## Demo seed data (optional)

Set `SEED_DEMO_PASSWORD` in `.env`. It must be at least 10 characters and at most 72 UTF-8 bytes. Then run:

```bash
npm run db:seed
```

The seed creates:

- **Accounts:** `admin@synk.test`, `member@synk.test` and `outsider@synk.test`, all using that password.
- **Workspace "Synk Demo"** for the admin and member. It has a `general` channel with a welcome message and a project `FYP` (key `SYN`) that both can edit.
- **Tickets and a sprint:** ticket `SYN-101`, plus an active `Sprint 4` with finished and open tickets so reports and the overview have data.
- **Docs and time:** three docs pages and four time entries.
- **A separate workspace** for the outsider account.

Seeding is opt-in and can be run again safely: existing data is skipped and existing passwords are kept. It refuses to run when `NODE_ENV=production`.

## Testing

```bash
npm run lint
npm run typecheck
npm test               # unit tests
npm run build
```

### Integration and end-to-end tests

Both suites need a **disposable, migrated PostgreSQL database**. They create their own records in it. Never point them at a production database. Compose creates only the `synk` database, so create the test database once:

```bash
docker compose exec postgres createdb -U synk synk_test
```

Point both variables at the test database, migrate it, and run the suites:

```bash
export DATABASE_URL='postgresql://synk:synk_local_only@127.0.0.1:5432/synk_test'
export TEST_DATABASE_URL="$DATABASE_URL"
npm run db:migrate
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://synk:synk_local_only@127.0.0.1:5432/synk_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
```

Keep `DATABASE_URL` pointed at the test database too. The tests use `TEST_DATABASE_URL`, but the app server that Playwright starts uses `DATABASE_URL`. By default, Playwright starts the development server, unless a local server is already running. Stop any running `npm run dev` first: Playwright reuses a server already listening on port 3000, and that server keeps whatever `DATABASE_URL` it was started with.

### Production-mode browser tests

To test the production build, as CI does:

```bash
npm run build
E2E_SERVER_COMMAND="npm start" npm run test:e2e
# PowerShell: $env:E2E_SERVER_COMMAND = "npm start"; npm run test:e2e
```

`npm start` refuses to run without email settings. Placeholder Mailtrap SMTP values are enough, because the browser tests do not need emails to be delivered.

### Coverage, load test and walkthrough

`npm run test:coverage` runs the unit and integration tests with coverage, as CI does, and fails below 80% of server-code lines. `npm run test:load` measures API response times and `npm run test:walkthrough` times the sign-up-to-first-AI-ticket flow; both need a running server. See [testing.md](testing.md) for what they measure and the latest results.

### CI parity

The `Chat foundation` workflow ([`.github/workflows/chat-ci.yml`](../.github/workflows/chat-ci.yml)) has two jobs:

- **agent:** builds the agent image and runs pytest inside it, with no API key.
- **verify:** uses Node 22 with a `postgres:16-alpine` service. It runs `npm ci`, `db:generate`, `db:migrate`, lint, typecheck, unit and integration tests together with coverage (`test:coverage`), and `build`. Then it runs Playwright on Chromium against `npm start`, with placeholder Mailtrap SMTP values.

## Production runtime

```bash
npm ci
npm run db:migrate
npm run build          # also runs prisma generate
npm start
```

- **Use the custom Node server, not `next start`.** `npm start` runs `server.ts`, which hosts Next.js and Socket.IO in one process and shares the permission layer between them.
- **Hosting.** Use a persistent Node host with PostgreSQL and HTTPS. The reverse proxy must forward WebSocket upgrades. A serverless-only deployment cannot run the custom socket server.
- **Proxies.** Set `TRUSTED_PROXY_IPS` to the exact addresses of your reverse proxies, so rate limits apply to each client. Each proxy must append to `X-Forwarded-For`. The header is ignored on connections from any other address.
- **Required settings.** The server refuses to start without `DATABASE_URL`, `NEXTAUTH_URL`, a `NEXTAUTH_SECRET` of at least 32 characters, and email settings. Keep all secrets in environment variables.
- **Security headers.** The app sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. It does not set Content-Security-Policy or Strict-Transport-Security.

### Single-instance limits

This version supports one Node instance. Rate limits, Socket.IO rooms, live session revocation and the agent's one-turn-at-a-time lock are all held in process memory. Running more than one instance would need:

- a Socket.IO adapter;
- a shared rate-limit store;
- session revocation that reaches every instance.

Saved messages are authoritative, and live delivery is at-least-once, not exactly-once. If the process fails after a message is saved but before it is published, clients get the message when they reload history after reconnecting.

### Sessions

- **Lifetime.** NextAuth JWT cookies are backed by `LoginSession` rows. Each session lasts 7 days from sign-in, and cookies use the secure flag when `NEXTAUTH_URL` is HTTPS.
- **Revocation.** Signing out, "sign out of other sessions", changing the password and resetting the password all delete the matching rows and disconnect the matching live sockets. Removing a member from a workspace, or a member leaving, removes their live channel subscriptions.
- **Maintenance.** Expired `LoginSession` rows are not cleaned up automatically. Remove them periodically.

Account deletion is not implemented.

## Password reset policy

- **Forgot password?** on the login page requests a single-use link that expires after 15 minutes. Only a SHA-256 hash of the token is stored.
- Each account receives at most one reset email every 5 minutes. Earlier links keep working until they expire or a reset succeeds.
- The response is the same whether or not the email exists. The account is processed after the response is sent.
- Accounts that only use OAuth sign-in do not receive reset links.
- A successful reset changes the password, invalidates every reset link and signs the user out everywhere, including live chat sockets.
- Requests are rate-limited per IP: 5 forgot-password requests and 10 reset attempts per 15 minutes.
- Passwords must be at least 10 characters and at most 72 UTF-8 bytes.
