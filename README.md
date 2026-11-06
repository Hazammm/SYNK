# SYNK

AI-powered team workspace. This branch implements the PRD's **critical-path chat module** and the authentication, membership and database foundation it requires.

## What is functional

- Invite-only email/password authentication with NextAuth v4 JWT sessions in HTTP-only cookies and revocable login records. There is no public sign-up endpoint.
- Workspace creation establishes the creator as ADMIN, along with a starter project and general channel, in one database transaction.
- Workspace admins can send seven-day, single-use, hashed-token invitations through Mailtrap. Existing accounts sign in to accept; new invitees create an account when joining.
- Settings > Members shows workspace roles and pending invites. Only admins can invite, resend, revoke, or remove members.
- Public and private channels, joining, member management, persistent messages and one-level threads.
- REST history with cursor pagination and Socket.IO live delivery. Reconnect reloads the newest page; older history remains available through pagination.
- Shared access checks. Workspace membership is required, and channel membership is separately required for reading, writing and subscribing. Admins do not bypass channel membership.
- Retry-safe message creation using a client UUID, plus UI deduplication of REST and socket responses.
- Ticket-key links such as `SYN-101` open a real, permission-checked read-only ticket page. The demo seed provides a ticket; issue-tracking CRUD remains future work.

The original overview, board, docs, alerts, time and settings screens are explicitly labeled **Product preview with sample data**. They are not implemented backend modules. The LangGraph AI agent is a later milestone.

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

### Optional demo records

Set `SEED_DEMO_PASSWORD` in `.env` (at least 10 characters and at most 72 UTF-8 bytes), then:

```bash
npm run db:seed
```

Accounts: `admin@synk.test`, `member@synk.test`, `outsider@synk.test`. The first two share a workspace and project; the third belongs to a different workspace. `SYN-101` is a real seeded ticket. Seeding is opt-in, idempotent, does not overwrite existing passwords and refuses production mode.

### Mailtrap invitations

Set `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS`, and `MAIL_FROM` in `.env` to enable email delivery. Workspace creation without invitations does not require Mailtrap configuration. Invitation tokens are stored only as SHA-256 hashes and expire after seven days.

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

PowerShell environment variables use `$env:DATABASE_URL = '...'` and `$env:TEST_DATABASE_URL = $env:DATABASE_URL`. Browser tests start the development server automatically unless an existing local server is available. For production browser checks, run `npm run build` first and set `E2E_SERVER_COMMAND="npm start"` (PowerShell: `$env:E2E_SERVER_COMMAND = "npm start"`) before `npm run test:e2e`; CI uses this mode. Keep `DATABASE_URL` pointed at the disposable test database for the server as well as the tests. They create accounts/workspaces in that database. See [the QA plan](docs/chat-qa.md) for test cases and [implementation notes](docs/chat-implementation.md) for scope and API contracts.

## Production runtime

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm start
```

Run the **custom Node server**, not `next start`. It hosts Next.js and Socket.IO in the same process and shares the authenticated permission layer. Use a persistent Node host with PostgreSQL and HTTPS, with the reverse proxy forwarding WebSocket upgrades. A serverless-only deployment cannot run this custom socket server.

This version supports one Node instance. Before scaling to multiple instances, add a Socket.IO adapter, shared rate limiting and cross-instance revocation. Message persistence is authoritative; if the process fails after a commit but before publication, reconnect/history recovers the message. Delivery is not an exactly-once transport guarantee.

Secrets belong only in environment variables. NextAuth JWT cookies use secure flags when `NEXTAUTH_URL` is HTTPS. Login records provide a seven-day absolute session lifetime and revocation on sign-out. Remove expired `LoginSession` rows periodically as routine database maintenance. Password reset and account deletion are not implemented.
