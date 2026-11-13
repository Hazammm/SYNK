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
import { timeEntrySchema, timeListSchema, timerStartSchema } from "../src/lib/validation";
import { agentChatSchema, docCreateSchema, docUpdateSchema, passwordChangeSchema, profileUpdateSchema } from "../src/lib/validation";
import { parseInline, parseMarkdown, plainText, safeHref, toggleTask } from "../src/lib/markdown";
import { insertCodeBlock, insertLink, toggleLinePrefix, wrapSelection } from "../src/features/docs/editing";
import { buildTree, descendantsOf } from "../src/features/docs/tree";
import { addDays, dayKey, entrySeconds, formatClock, formatDuration, hours, localToIso, secondsByDay, startOfWeek, totalsBy, weekDays } from "../src/features/time/calc";
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

test("settings accept only a name or notification switches, and passwords that meet the rules", () => {
  const profile = (value: object) => profileUpdateSchema.safeParse(value).success;
  assert.equal(profile({ name: "Asra" }), true);
  assert.equal(profile({ notifications: { mentions: false } }), true);
  assert.equal(profile({ name: "Asra", notifications: { assigned: true, comments: false } }), true);
  assert.equal(profile({}), false); assert.equal(profile({ notifications: {} }), false);
  assert.equal(profile({ name: " " }), false); assert.equal(profile({ name: "x".repeat(81) }), false);
  assert.equal(profile({ email: "a@b.test" }), false); assert.equal(profile({ notifications: { everything: true } }), false);
  assert.equal(profileUpdateSchema.parse({ name: "  Asra Khan " }).name, "Asra Khan");
  const password = (value: object) => passwordChangeSchema.safeParse(value).success;
  assert.equal(password({ currentPassword: "old", newPassword: "long-enough-1" }), true);
  assert.equal(password({ currentPassword: "", newPassword: "long-enough-1" }), false);
  assert.equal(password({ currentPassword: "old", newPassword: "short" }), false);
  assert.equal(password({ currentPassword: "old", newPassword: "é".repeat(40) }), false); // over 72 bytes
});

test("markdown blocks: headings, lists, checklists, code, quotes and paragraphs", () => {
  const blocks = parseMarkdown("# Title\n\nFirst line\nsame paragraph\n- one\n- two\n1. first\n2) second\n- [ ] todo\n- [x] done\n> quoted\n> more\n---\n```ts\nconst x = 1;\n\nfoo()\n```\n#### four");
  assert.deepEqual(blocks.map(block => block.type), ["heading", "paragraph", "list", "list", "list", "quote", "rule", "code", "paragraph"]);
  assert.deepEqual(blocks[1], { type: "paragraph", inline: [{ type: "text", text: "First line same paragraph" }] });
  assert.deepEqual(blocks[3], { type: "list", ordered: true, items: [{ inline: [{ type: "text", text: "first" }], checked: null, line: 6 }, { inline: [{ type: "text", text: "second" }], checked: null, line: 7 }] });
  assert.deepEqual((blocks[4] as { items: { checked: boolean | null; line: number }[] }).items.map(item => [item.checked, item.line]), [[false, 8], [true, 9]]);
  assert.deepEqual(blocks[5], { type: "quote", inline: [{ type: "text", text: "quoted more" }] });
  assert.deepEqual(blocks[7], { type: "code", language: "ts", text: "const x = 1;\n\nfoo()" });
  assert.deepEqual(parseMarkdown("```\nunclosed"), [{ type: "code", language: null, text: "unclosed" }]);
  assert.deepEqual(parseMarkdown("  \n\n"), []);
});
test("markdown inline: emphasis, code and only safe links", () => {
  assert.deepEqual(parseInline("a **b** *c* _d_ `e` [f](https://x.test/p?q=1)"), [
    { type: "text", text: "a " }, { type: "strong", text: "b" }, { type: "text", text: " " }, { type: "em", text: "c" }, { type: "text", text: " " },
    { type: "em", text: "d" }, { type: "text", text: " " }, { type: "code", text: "e" }, { type: "text", text: " " }, { type: "link", text: "f", href: "https://x.test/p?q=1" },
  ]);
  // Script and data links stay as plain text, so a page can never run code.
  assert.deepEqual(parseInline("[x](javascript:alert(1))"), [{ type: "text", text: "[x](javascript:alert(1))" }]);
  assert.deepEqual(parseInline("[x](data:text/html,hi)"), [{ type: "text", text: "[x](data:text/html,hi)" }]);
  assert.deepEqual([safeHref("/docs"), safeHref("//evil.test"), safeHref("mailto:a@b.test"), safeHref("JAVASCRIPT:x"), safeHref("not a url")], ["/docs", null, "mailto:a@b.test", null, null]);
  assert.deepEqual(parseInline("<script>alert(1)</script>"), [{ type: "text", text: "<script>alert(1)</script>" }]);
});
test("markdown helpers: plain text for search and toggling checklist items", () => {
  assert.equal(plainText("# Goals\n\nShip the **beta** by [Friday](https://x.test).\n- [ ] tests"), "Goals Ship the beta by Friday. tests");
  assert.equal(toggleTask("a\n- [ ] one\n  * [x] two", 1), "a\n- [x] one\n  * [x] two");
  assert.equal(toggleTask("a\n- [ ] one\n  * [x] two", 2), "a\n- [ ] one\n  * [ ] two");
  assert.equal(toggleTask("- plain item", 0), "- plain item");
  assert.equal(toggleTask("x", 9), "x");
});
test("editor toolbar edits keep the right text selected", () => {
  assert.deepEqual(wrapSelection("hello world", 6, 11, "**"), { text: "hello **world**", start: 8, end: 13 });
  assert.deepEqual(wrapSelection("hi ", 3, 3, "*"), { text: "hi *text*", start: 4, end: 8 });
  assert.deepEqual(toggleLinePrefix("one\ntwo\nthree", 1, 6, "- "), { text: "- one\n- two\nthree", start: 0, end: 11 });
  assert.equal(toggleLinePrefix("- one\n- two", 0, 11, "- ").text, "one\ntwo"); // all prefixed, so removed
  assert.equal(toggleLinePrefix("a\nb", 2, 2, "## ").text, "a\n## b");
  assert.deepEqual(insertCodeBlock("before x after", 7, 8), { text: "before \n```\nx\n```\n after", start: 12, end: 13 });
  const link = insertLink("see docs", 4, 8);
  assert.equal(link.text, "see [docs](https://)");
  assert.equal(link.text.slice(link.start, link.end), "https://");
});
test("docs permissions and schemas", () => {
  assert.equal(can("doc:read", { role: "MEMBER", projectLevel: "READ" }), true);
  assert.equal(can("doc:write", { role: "MEMBER", projectLevel: "READ" }), false);
  assert.equal(can("doc:write", { role: "MEMBER", projectLevel: "WRITE" }), true);
  assert.equal(can("doc:read", { role: "ADMIN", projectLevel: null }), false); // admins still need project access
  assert.deepEqual(docCreateSchema.parse({ title: "  Spec " }), { title: "Spec", content: "" });
  assert.equal(docCreateSchema.safeParse({ title: "Spec", projectId: "p1" }).success, false);
  assert.equal(docUpdateSchema.safeParse({ version: 1 }).success, false); // nothing to update
  assert.equal(docUpdateSchema.safeParse({ title: "x" }).success, false); // needs the version it started from
  assert.equal(docUpdateSchema.safeParse({ version: 2, parentId: null }).success, true);
});

test("page tree: nests pages under parents and finds every page below one", () => {
  const page = (id: string, parentId: string | null) => ({ id, parentId, title: id, position: 0, lastEditedAt: "2026-11-13T00:00:00.000Z", lastEditedBy: null });
  const docs = [page("brief", null), page("spec", "brief"), page("api", "spec"), page("retro", null), page("orphan", "deleted")];
  const tree = buildTree(docs);
  assert.deepEqual(tree.map(node => node.id), ["brief", "retro", "orphan"]); // a missing parent shows at the top level
  assert.deepEqual(tree[0].children.map(node => node.id), ["spec"]);
  assert.deepEqual(tree[0].children[0].children.map(node => node.id), ["api"]);
  assert.deepEqual([...descendantsOf(docs, "brief")].sort(), ["api", "brief", "spec"]);
  assert.deepEqual([...descendantsOf(docs, "retro")], ["retro"]);
});

test("time weeks start on Monday and step by calendar days", () => {
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 13, 15, 30))), "2026-11-09"); // Friday -> Monday
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 15))), "2026-11-09"); // Sunday belongs to the week before
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 16))), "2026-11-16"); // Monday starts a week
  assert.deepEqual(weekDays(new Date(2026, 9, 26)).map(dayKey), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(dayKey(addDays(new Date(2026, 11, 31), 1)), "2027-01-01");
  assert.equal(localToIso("2026-11-13", "09:30"), new Date(2026, 10, 13, 9, 30).toISOString());
  assert.equal(localToIso("", "09:30"), null);
});
