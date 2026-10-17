# Chat verification and manual QA

## Automated checks

- `npm test`: permission matrix, input validation, byte limits, same-origin protection, JSON size limits and client message deduplication.
- `npm run test:integration`: real Prisma queries, transactions, tenant/channel separation, private joins, idempotency, thread parents, cursor boundaries, relational constraints, socket handshakes, live delivery, session revocation and reconnect history.
- `npm run test:e2e`: two independent browser sessions using the actual signup/login forms, workspace membership, joining, message delivery, threads, reload persistence, private-channel denial, cross-origin denial, mobile layout and sign-out.
- `npm run lint`, `npm run typecheck`, `npm run build`: source and production build verification.

The automated workflow in `.github/workflows/chat-ci.yml` runs these against PostgreSQL 16. Local integration/browser verification in this implementation environment uses the PostgreSQL engine provided by PGlite over its wire-protocol server, because Docker/native PostgreSQL are unavailable here. Production PostgreSQL CI, external OAuth callbacks, multi-node behavior and load testing must be verified in the deployment environment.

## Verification record (October 17, 2026)

The implementation was checked locally: 7 unit tests and 12 database/socket integration tests passed. The production build, TypeScript check and ESLint passed. The automated two-user Chromium browser workflow passed; the observed cross-user delivery check, including UI actions, took 408 ms in one local run (not a load-test guarantee). Desktop and 390 px mobile screenshots were visually inspected. The manual cases below are a handoff plan, not a claim that every case was manually executed. External OAuth and native PostgreSQL CI remain unverified here.

## Manual acceptance plan

Use the optional demo seed or create two separate accounts. Open two independent browser profiles (not two tabs sharing one cookie jar). Use a third account/workspace for negative tests.

| ID | Steps | Expected result |
| --- | --- | --- |
| AUTH-01 | Open `/chat` while signed out. | Redirect to login; no workspace data is shown. |
| AUTH-02 | Register with valid values, then sign out and sign back in. Try a wrong password. | Successful credentials open real chat; wrong credentials do not create a session. |
| AUTH-03 | Sign out while another tab for the same login is open, then reload it. | Access is denied; the old login record is revoked and its live sockets disconnect. |
| WS-01 | Create a workspace. Refresh. | Workspace persists; creator is Admin and has joined general. |
| WS-02 | Add an already registered teammate by email; refresh the teammate's browser. | Workspace appears for the teammate with Member role; no email is sent. |
| WS-03 | As Member, try the add-member API. | HTTP 403, with no membership change. |
| CH-01 | Create a public channel; select it as another workspace member. | Channel is discoverable, but history is inaccessible until Join succeeds. |
| CH-02 | Create a private channel; refresh as an uninvited member. | Channel is absent. Direct history, send and socket subscription are denied. |
| CH-03 | From Workspace members, add a workspace member to the private channel as its creator or a joined admin. | On refresh, the invited user sees the channel and can participate. |
| CH-04 | Create a private channel as a normal Member and add another workspace member. | Creator can add the teammate; an unrelated channel member cannot add others. |
| MSG-01 | Send a plain-text message from browser A. | Browser B sees the committed message without refreshing; A sees only one copy. |
| MSG-02 | Reload both browsers. | Stored history persists with actual sender and time. |
| MSG-03 | Send blank/whitespace content, over 4,000 characters, invalid JSON or a sender ID in the request. | Validation error; no message is stored. |
| MSG-04 | Repeat a POST with the same client UUID and same body. Repeat again with different body. | First retry returns the same message ID; changed-body retry is 409. |
| MSG-05 | Create more than 30 messages; load older pages. | Chronological ordering, no gaps/duplicates, and bounded pages. |
| TH-01 | Reply to a message and open its thread in the other browser. | Reply count updates live; thread replies persist and do not appear as root messages. |
| TH-02 | Send a reply referencing a root from another channel or a reply as its parent. | Rejected without writing. |
| REF-01 | In seeded general, click SYN-101. Repeat from an account without that project grant. | Authorized user sees the real ticket. Inaccessible/unknown tickets show the same unavailable page. |
| SEC-01 | Request another workspace's channels/history using guessed IDs. | HTTP 403; no data is returned. |
| SEC-02 | Connect a socket with no cookie, a forged cookie, an expired cookie or a different Origin. | Connection denied. A client-supplied identity has no effect. |
| SEC-03 | Remove a Member via the admin removal API while they are connected. | Channel grants cascade away; history/writes are denied and live content stops. |
| SEC-04 | POST from a mismatched or missing Origin. | HTTP 403 even when the session cookie is otherwise valid. |
| RT-01 | Disconnect browser B, send several messages in A, then reconnect B. | B fetches the newest page; missed history is available without an invisible gap. |
| UI-01 | Switch channels/workspaces with delayed network requests in flight. | Old responses/events do not populate the new view. Drafts and threads belong to the selected channel. |
| UI-02 | Use Enter, Shift+Enter and an IME composer; test at 390 px width. | Enter sends, Shift+Enter creates a newline, IME composition is not interrupted, and the layout fits. |
| UI-03 | Simulate a send failure, then retry the unchanged draft. | Draft is preserved and the same UUID is reused; persisted duplicates are prevented. |
| UI-04 | Open the existing board/docs/time/overview pages. | They are clearly labeled as sample-data product previews. |

## API request examples

Use the authenticated browser session's cookies. Supply the configured application origin on writes.

```json
POST /api/channels/<channelId>/messages
{
  "body": "Please check SYN-101",
  "parentId": null,
  "clientMessageId": "64b38fe7-3435-42dc-8ced-e68abf5383a7"
}
```

For a thread reply, replace `parentId` with a top-level message ID from the same channel and use a new client UUID. To fetch replies: `GET /api/channels/<channelId>/messages?parentId=<messageId>`. To fetch earlier history: add `cursor=<nextCursor>` from the preceding response.

To revoke a workspace Member: `DELETE /api/workspaces/<workspaceId>/members/<userId>` as that workspace's Admin. The removal API intentionally refuses Admin removal; full role administration is a later feature.
