# Critical-path chat implementation

## Why this work comes first

Both supplied PRDs (v1.0, October 17, 2026) name chat as P0 **critical path** in sections 5, 6.3 and 11. The scope-protection rule explicitly protects chat first. The AI agent is also P0 and the product differentiator, but it depends on persisted application data, authenticated users and reusable permissions.

The starting commit, `fd4815d6db8393784dfa68b194d5f7ed7837bcf2`, had frontend mock data, local-state chat and a login form that only navigated to the overview. It had no API routes, database schema or real authentication. This branch implements the prerequisites and the chat workflow together. It does not attempt all eight sprints at once.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| FR-C1 | Workspace channels; members create and join public channels; private channel membership is controlled by the creator or joined workspace admin. |
| FR-C2 | Same-origin authenticated Socket.IO subscriptions and authorized live publication after REST writes commit. |
| FR-C3 | REST history, bounded page sizes and stable `(createdAt, id)` cursors scoped to channel and thread. |
| FR-C4 | Top-level messages and one-level threads; validation rejects cross-channel and nested thread parents. |
| FR-C5 | Ticket-key detection, real ticket read model and project-scoped detail route. Ticket/board authoring is deferred. |
| FR-C6 | Channel membership checked for history, posting, socket subscription and each outgoing event. |
| FR-A1 / A3 / A4 | Credentials registration, hashed passwords, NextAuth cookies and protected application routes; public registration and NextAuth endpoints are necessary exceptions. |
| FR-A2 | Optional Google/GitHub providers and Bitbucket provider configuration; external callbacks need provider testing. |
| FR-A5 / A6 | Admin/member workspace roles, project read/write grants, centralized deny-by-default policy and channel access guards. |
| FR-W1 / W4 | Atomic workspace/admin/general creation; workspace and project discovery are scoped to the caller. |
| FR-W2 | Admin adds an already registered teammate as Member. Email invitation delivery and role-editing UI are deferred. |
| FR-W3 | Workspace/project relations and the minimal ticket reference model; boards, docs and full project management are deferred. |

## Structure

| Path | Purpose |
| --- | --- |
| `prisma/` | PostgreSQL schema, initial migration and opt-in demo seed. |
| `src/lib/auth.ts`, `session.ts` | NextAuth configuration, revocable JWT sessions and authenticated user resolution. |
| `src/lib/permissions.ts` | Shared policy and membership lookups, reusable by later AI tool endpoints. |
| `src/features/workspaces/service.ts` | Workspace/membership business logic and transactions. |
| `src/features/chat/service.ts` | Channel management, history, threads, idempotent message persistence. |
| `src/server/socket.ts`, `server.ts` | Custom Node runtime, cookie authentication, subscriptions and live authorization. |
| `src/features/chat/ChatWorkspace.tsx`, `client.ts` | Real workspace UI, channel/thread feeds, retry handling and reconnect synchronization. |
| `tests/` | Policy/input unit tests, database/socket integration tests and browser workflow. |

## API contracts

All responses use JSON. Errors are `{ "error": "safe explanation" }`. Authenticated writes require `Origin` to exactly match `NEXTAUTH_URL`; JSON endpoints also enforce content type and a 20 KB streamed body limit. A caller cannot provide their own identity or workspace role.

| Method | Path | Contract |
| --- | --- | --- |
| POST | `/api/auth/register` | `{name,email,password}`; creates a user with a bcrypt hash; then sign in through NextAuth. |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth session/login/provider/logout endpoints and CSRF handling. |
| GET/POST | `/api/workspaces` | List caller's workspaces / create `{name}` with Admin and general channel. |
| GET/POST | `/api/workspaces/:id/members` | List members / admin adds registered `{email}` as Member. |
| DELETE | `/api/workspaces/:id/members/:userId` | Admin removes a Member, cascades channel grants and evicts active subscriptions. Admin removal is refused. |
| GET/POST | `/api/workspaces/:id/channels` | Visible channel list / create `{name,description?,isPrivate?}` and join creator. |
| POST | `/api/channels/:id/join` | Workspace member joins public channel. Does not grant private-channel access. |
| POST | `/api/channels/:id/members` | Creator or joined admin adds existing workspace `{userId}`. |
| GET | `/api/channels/:id/messages` | Optional `parentId`, `cursor`, `limit` (1–100; default 30). Returns `{messages,nextCursor}` in chronological order. |
| POST | `/api/channels/:id/messages` | `{body,parentId?,clientMessageId}`. UUID retained across retries. Returns `{message}`; reused UUID with different content is 409. |
| GET | `/tickets/:key?workspaceId=...` | Read-only ticket page for explicit project members. Unknown and inaccessible tickets share the unavailable response. |

Socket events: `channel:join` takes `{channelId}` and returns `{ok:true}` or `{ok:false,error}` by acknowledgement; `channel:leave` releases the active subscription. `message:created` carries `{message,parentReplyCount?}`. `access:revoked` clears the feed. Live sockets never accept client identity or unauthenticated message writes.

The UI resets to the newest page on reconnect instead of merging a small page into old history and leaving an invisible gap. Older pages remain accessible. Thread replies use separate history queries and are not mixed into top-level history. Plain text rendering prevents message HTML execution. Ticket links expose no additional ticket title or metadata until project permission is checked.

## Deployment and next milestone

The runtime is a single persistent Node process. Socket rooms are an optimization, not an authorization source. Every publish revalidates the encrypted cookie, revocation record and current channel membership. A post-commit delivery failure does not roll back or duplicate the stored message. PostgreSQL transactions cover workspace/channel setup and writes that span several rows.

Next: implement project/board/ticket authoring and full project-access management; then the LangGraph agent using permission-checked HTTP tools. Do not let the Python service bypass these checks with unrestricted direct writes. Add confirmation and action logs with the AI tool implementation. OAuth verification, email verification/recovery, invitation delivery, rate-limit coordination across nodes and load testing remain explicit follow-up work.
