import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { can, type Action } from "../src/lib/permissions";
import { channelSchema, forgotPasswordSchema, historySchema, messageSchema, registerSchema, resetPasswordSchema } from "../src/lib/validation";
import { assertSameOrigin, readJson } from "../src/lib/http";
import { parseTrustedProxies, resolveClientIp } from "../src/lib/client-ip";
import { burndown, percent, sprintDays } from "../src/features/reports/calc";
import { toCsv } from "../src/lib/csv";
import { AGENT_TOKEN_TTL_MS, mintAgentToken, verifyAgentToken } from "../src/lib/agent-token";
import { isNone, isSelf, matchByName } from "../src/features/agent/resolve";
import { agentChatSchema } from "../src/lib/validation";
import { mergeMessages } from "../src/features/chat/client";
import { boardUpdateSchema, commentSchema, projectSchema, sprintSchema, ticketFilterSchema, ticketSchema, ticketUpdateSchema } from "../src/lib/validation";
import { initials, trackerHref } from "../src/features/tickets/ui";
import type { ChatMessage } from "../src/lib/chat-types";

test("deny by default, including workspace admins outside a channel or project", () => {
  for (const action of ["workspace:read", "workspace:manage", "channel:read", "channel:write", "project:read", "project:write"] as Action[]) {
    assert.equal(can(action, { role: null, channelMember: true, projectLevel: "WRITE" }), false);
  }
  assert.equal(can("channel:read", { role: "ADMIN", channelMember: false }), false);
  assert.equal(can("project:read", { role: "ADMIN" }), false);
  assert.equal(can("unknown" as Action, { role: "ADMIN" }), false);
});
test("members can participate but cannot administer workspaces", () => {
  assert.equal(can("workspace:read", { role: "MEMBER" }), true);
  assert.equal(can("workspace:manage", { role: "MEMBER" }), false);
  assert.equal(can("workspace:manage", { role: "ADMIN" }), true);
  assert.equal(can("channel:write", { role: "MEMBER", channelMember: true }), true);
  assert.equal(can("project:write", { role: "MEMBER", projectLevel: "READ" }), false);
  assert.equal(can("project:write", { role: "MEMBER", projectLevel: "WRITE" }), true);
});
test("message validation rejects spoofed senders, empty text, oversized content and invalid retry keys", () => {
  const base = { body: "Hello", clientMessageId: randomUUID() };
  assert.equal(messageSchema.safeParse(base).success, true);
  for (const input of [{ ...base, senderId: "another-user" }, { ...base, body: " \n\t " }, { ...base, body: "x".repeat(4001) }, { ...base, clientMessageId: "123" }]) {
    assert.equal(messageSchema.safeParse(input).success, false);
  }
});
test("password byte limit, bounded history and channel name validation", () => {
  assert.equal(registerSchema.safeParse({ name: "Test", email: "test@example.com", password: "😀".repeat(20) }).success, false);
  assert.equal(historySchema.safeParse({ limit: 101 }).success, false);
  assert.equal(historySchema.safeParse({ limit: "-1" }).success, false);
  assert.equal(channelSchema.safeParse({ name: "../private" }).success, false);
});
test("cookie-authenticated writes require the configured origin", () => {
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  assert.throws(() => assertSameOrigin(new Request("http://localhost:3000/api/workspaces")));
  assert.throws(() => assertSameOrigin(new Request("http://localhost:3000/api/workspaces", { headers: { origin: "https://attacker.example" } })));
  assert.doesNotThrow(() => assertSameOrigin(new Request("http://localhost:3000/api/workspaces", { headers: { origin: "http://localhost:3000" } })));
});
test("JSON reader limits actual bytes and handles malformed input", async () => {
  const request = (body: string) => new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body });
  await assert.rejects(readJson(request("{")), /Invalid JSON/);
  await assert.rejects(readJson(request(JSON.stringify({ body: "x".repeat(20_001) }))), /too large/);
});
test("client merges REST/socket retries and does not lose a newer thread count", () => {
  const row: ChatMessage = { id: "a", channelId: "c", body: "hello", clientMessageId: randomUUID(), createdAt: "2026-10-17T00:00:00.000Z", parentId: null, sender: { id: "u", name: "User" }, replyCount: 2 };
  const merged = mergeMessages([row], [{ ...row, replyCount: 0 }, { ...row, id: "b" }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].replyCount, 2);
  assert.deepEqual(merged.map(row => row.id), ["a", "b"]);
});
test("forgot password and reset password validation schemas", () => {
  assert.equal(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success, true);
  assert.equal(forgotPasswordSchema.safeParse({ email: "invalid-email" }).success, false);
  assert.equal(forgotPasswordSchema.safeParse({ email: "user@example.com", extra: 1 }).success, false);

  assert.equal(resetPasswordSchema.safeParse({ token: "abc12345", password: "StrongPassword123!" }).success, true);
  assert.equal(resetPasswordSchema.safeParse({ token: "", password: "StrongPassword123!" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token: "abc12345", password: "short" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token: "abc12345", password: "😀".repeat(20) }).success, false);
});

test("client IP only trusts X-Forwarded-For entries added by known proxies", () => {
  const proxies = parseTrustedProxies("10.0.0.1, 10.0.0.2");
  // Direct connections can't forge their address, with or without a proxy list.
  assert.equal(resolveClientIp("6.6.6.6", "1.2.3.4", proxies), "6.6.6.6");
  assert.equal(resolveClientIp("10.0.0.1", "1.2.3.4", new Set()), "10.0.0.1");
  // Behind trusted proxies, the rightmost unknown address is the client.
  assert.equal(resolveClientIp("10.0.0.1", "203.0.113.9", proxies), "203.0.113.9");
  assert.equal(resolveClientIp("10.0.0.1", "6.6.6.6, 203.0.113.9", proxies), "203.0.113.9");
  assert.equal(resolveClientIp("10.0.0.2", "6.6.6.6, 203.0.113.9, 10.0.0.1", proxies), "203.0.113.9");
  // IPv4-mapped socket addresses still match, and missing headers fall back.
  assert.equal(resolveClientIp("::ffff:10.0.0.1", "203.0.113.9", proxies), "203.0.113.9");
  assert.equal(resolveClientIp("::ffff:6.6.6.6", undefined, proxies), "6.6.6.6");
  assert.equal(resolveClientIp("10.0.0.1", undefined, proxies), "10.0.0.1");
  assert.equal(resolveClientIp("10.0.0.1", "10.0.0.2", proxies), "10.0.0.1");
  assert.equal(resolveClientIp(undefined, undefined, proxies), "unknown");
});

test("issue tracking permissions: READ views, WRITE changes, only admins manage projects", () => {
  const writes: Action[] = ["project:write", "ticket:write", "ticket:comment", "board:manage", "sprint:manage"];
  const reads: Action[] = ["project:read", "ticket:read"];
  for (const action of [...reads, ...writes, "project:manage"] as Action[]) {
    assert.equal(can(action, { role: null, projectLevel: "WRITE" }), false, `${action} without workspace membership`);
  }
  for (const action of reads) {
    assert.equal(can(action, { role: "MEMBER", projectLevel: "READ" }), true);
    assert.equal(can(action, { role: "ADMIN", projectLevel: null }), false, `${action}: admins need project access too`);
  }
  for (const action of writes) {
    assert.equal(can(action, { role: "MEMBER", projectLevel: "READ" }), false, `${action} with READ`);
    assert.equal(can(action, { role: "MEMBER", projectLevel: "WRITE" }), true, `${action} with WRITE`);
    assert.equal(can(action, { role: "ADMIN" }), false, `${action}: admin without access`);
  }
  assert.equal(can("project:manage", { role: "ADMIN" }), true);
  assert.equal(can("project:manage", { role: "MEMBER", projectLevel: "WRITE" }), false);
});
test("deleting tickets needs edit access to the project", () => {
  assert.equal(can("ticket:delete", { role: "MEMBER", projectLevel: "WRITE" }), true);
  assert.equal(can("ticket:delete", { role: "MEMBER", projectLevel: "READ" }), false);
  assert.equal(can("ticket:delete", { role: "ADMIN", projectLevel: null }), false);
  assert.equal(can("ticket:delete", { role: null, projectLevel: "WRITE" }), false);
});
test("issue tracking validation: keys, dates, strict fields and filters", () => {
  assert.equal(projectSchema.parse({ name: " Synk ", key: " syn " }).key, "SYN");
  for (const key of ["S", "1AB", "SY-N", "TOOLONGKEY12", ""]) assert.equal(projectSchema.safeParse({ name: "P", key }).success, false, key);
  const ticket = ticketSchema.parse({ boardId: "b1", title: "  Fix it  ", dueDate: "2026-12-31" });
  assert.equal(ticket.title, "Fix it"); assert.equal(ticket.priority, "MEDIUM"); assert.equal(ticket.description, "");
  assert.equal(ticket.dueDate?.toISOString(), "2026-12-31T00:00:00.000Z");
  for (const input of [{ boardId: "b1", title: " " }, { boardId: "b1", title: "x".repeat(201) }, { boardId: "b1", title: "T", priority: "URGENT" }, { boardId: "b1", title: "T", reporterId: "u1" }, { boardId: "b1", title: "T", dueDate: "31/12/2026" }, { boardId: "b1", title: "T", dueDate: "2026-13-45" }, { boardId: "../x", title: "T" }]) {
    assert.equal(ticketSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.equal(ticketUpdateSchema.safeParse({}).success, false);
  assert.equal(ticketUpdateSchema.safeParse({ key: "SYN-999" }).success, false);
  assert.equal(ticketUpdateSchema.safeParse({ position: -1 }).success, false);
  assert.deepEqual(ticketUpdateSchema.parse({ assigneeId: null, dueDate: null, position: 0 }), { assigneeId: null, dueDate: null, position: 0 });
  assert.equal(ticketFilterSchema.safeParse({}).success, false);
  assert.equal(ticketFilterSchema.safeParse({ boardId: "b1", projectId: "p1" }).success, false);
  assert.equal(ticketFilterSchema.safeParse({ boardId: "b1", assigneeId: "none", sprintId: "none", priority: "HIGH" }).success, true);
  assert.equal(ticketFilterSchema.safeParse({ boardId: "b1", limit: "5" }).success, false);
  assert.equal(sprintSchema.safeParse({ name: "S", startDate: "2026-11-08", endDate: "2026-11-02" }).success, false);
  assert.equal(sprintSchema.safeParse({ name: "S", startDate: "2026-11-02", endDate: "2026-11-02" }).success, true);
  assert.equal(boardUpdateSchema.safeParse({ columns: [] }).success, false);
  assert.equal(boardUpdateSchema.safeParse({ columns: Array.from({ length: 13 }, (_, index) => ({ name: `C${index}` })) }).success, false);
  assert.equal(commentSchema.safeParse({ body: "   " }).success, false);
  assert.equal(commentSchema.safeParse({ body: "x".repeat(4001) }).success, false);
  assert.deepEqual(commentSchema.parse({ body: " hi " }), { body: "hi", mentionIds: [] });
});
test("tracker links keep only the selected values", () => {
  assert.equal(trackerHref("board", {}), "/board");
  assert.equal(trackerHref("sprints", { workspaceId: "w1", projectId: undefined, ticket: "" }), "/board/backlog?workspaceId=w1");
  assert.equal(trackerHref("board", { workspaceId: "w1", projectId: "p1", boardId: "b1", ticket: "t1" }), "/board?workspaceId=w1&projectId=p1&boardId=b1&ticket=t1");
  assert.equal(initials("Hazam Liaqat Khan"), "HL"); assert.equal(initials("  asra "), "A"); assert.equal(initials(null), "M");
});

test("sprint days are inclusive, cross month ends and reject backwards ranges", () => {
  assert.deepEqual(sprintDays("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(sprintDays("2026-11-05", "2026-11-05"), ["2026-11-05"]);
  assert.deepEqual(sprintDays("2026-11-05", "2026-11-04"), []);
  assert.deepEqual(sprintDays("nonsense", "2026-11-04"), []);
  assert.equal(sprintDays("2026-01-01", "2027-01-01").length, 92); // capped
});
test("burndown counts finished work per day and stops at today", () => {
  const points = burndown({ startDate: "2026-11-02", endDate: "2026-11-06", total: 4, today: "2026-11-04", completedDays: ["2026-11-01", "2026-11-03", "2026-11-03"] });
  assert.deepEqual(points.map(point => point.remaining), [3, 1, 1, null, null]); // early work counts from day one
  assert.deepEqual(points.map(point => point.ideal), [4, 3, 2, 1, 0]);
  assert.deepEqual(burndown({ startDate: "2026-11-02", endDate: "2026-11-02", total: 2, today: "2026-11-02", completedDays: [] }), [{ date: "2026-11-02", ideal: 2, remaining: 2 }]);
  assert.equal(burndown({ startDate: "2026-11-02", endDate: "2026-11-03", total: 0, today: "2026-11-09", completedDays: [] }).every(point => point.remaining === 0 && point.ideal === 0), true);
  assert.equal(percent(1, 3), 33); assert.equal(percent(0, 0), 0);
});

test("CSV export quotes every cell and defuses spreadsheet formulas", () => {
  assert.equal(toCsv([["Key", "Title"], ["SYN-1", 'Say "hi", then leave']]), '"Key","Title"\r\n"SYN-1","Say ""hi"", then leave"');
  assert.equal(toCsv([["=HYPERLINK(1)", "+1", "-2", "@x", 5, -3, null]]), `"'=HYPERLINK(1)","'+1","'-2","'@x","5","-3",""`);
  assert.equal(toCsv([["line\nbreak"]]), '"line\nbreak"');
});

test("agent tokens carry one person's claims and cannot be altered, reused late or re-signed", () => {
  process.env.NEXTAUTH_SECRET ??= "unit-only-not-a-production-secret-1234567890";
  const claims = { userId: "user1", workspaceId: "ws1", conversationId: "c1" };
  const now = 1_800_000_000_000;
  const token = mintAgentToken(claims, now);
  assert.deepEqual(verifyAgentToken(token, now + AGENT_TOKEN_TTL_MS - 1), { ...claims, expiresAt: now + AGENT_TOKEN_TTL_MS });
  const invalid = (value: string, at = now) => assert.throws(() => verifyAgentToken(value, at), { status: 401 });
  invalid(token, now + AGENT_TOKEN_TTL_MS); // expired
  const [payload, signature] = token.split(".");
  const other = Buffer.from(JSON.stringify({ ...claims, userId: "admin", expiresAt: now + AGENT_TOKEN_TTL_MS })).toString("base64url");
  invalid(`${other}.${signature}`); // changed claims, old signature
  invalid(`${payload}.${signature}.extra`); invalid(payload); invalid(""); invalid(`.${signature}`);
  // A token signed with another secret is refused.
  const secret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "a-different-secret-entirely-0000000000000000";
  try { invalid(token); } finally { process.env.NEXTAUTH_SECRET = secret; }
});
test("agent name matching prefers the most specific match and reports ties", () => {
  const people = [{ name: "Sarah Khan" }, { name: "Sarah Ali" }, { name: "Asra Sarahson" }, { name: null }];
  const names = (query: string) => { const match = matchByName(people, query, person => person.name); return match.kind === "one" ? match.item.name : match.kind === "many" ? match.items.map(item => item.name) : null; };
  assert.equal(names("sarah khan"), "Sarah Khan"); // exact, ignoring case
  assert.equal(names("  KHAN "), "Sarah Khan"); // a whole word
  assert.deepEqual(names("Sarah"), ["Sarah Khan", "Sarah Ali"]); // whole-word ties, not the "Sarahson" fragment
  assert.equal(names("asr"), "Asra Sarahson"); // prefix
  assert.equal(names("sarahs"), "Asra Sarahson"); // fragment, only when nothing better matches
  assert.equal(names("Bilal"), null); assert.equal(names("   "), null);
  assert.equal(isSelf(" Me "), true); assert.equal(isSelf("Mehmet"), false);
  assert.equal(isNone("Unassigned"), true); assert.equal(isNone("nobody"), true); assert.equal(isNone("Noor"), false);
});
test("agent chat turns are either a message or a decision", () => {
  const valid = (value: object) => agentChatSchema.safeParse(value).success;
  assert.equal(valid({ workspaceId: "w1", message: "hi" }), true);
  assert.equal(valid({ conversationId: "c1", message: "hi" }), true);
  assert.equal(valid({ conversationId: "c1", decision: "approve" }), true);
  assert.equal(valid({ workspaceId: "w1", decision: "approve" }), false); // a decision needs its conversation
  assert.equal(valid({ conversationId: "c1", message: "hi", decision: "reject" }), false);
  assert.equal(valid({ message: "hi" }), false); assert.equal(valid({ conversationId: "c1" }), false);
  assert.equal(valid({ conversationId: "c1", message: "   " }), false);
  assert.equal(valid({ conversationId: "c1", decision: "maybe" }), false);
  assert.equal(valid({ conversationId: "c1", message: "x".repeat(4001) }), false);
  assert.equal(valid({ conversationId: "c1", message: "hi", userId: "someone-else" }), false);
});
