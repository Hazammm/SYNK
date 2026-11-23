import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { can, type Action } from "../src/lib/permissions";
import {
  acceptInviteSchema,
  channelSchema,
  createWorkspaceGoogleSchema,
  createWorkspaceSchema,
  dmChannelSchema,
  driveImportSchema,
  extractPlainText,
  extractTextFromTiptap,
  forgotPasswordSchema,
  historySchema,
  isTiptapDoc,
  messageEditSchema,
  messageSchema,
  notificationReadSchema,
  passwordSchema,
  resetPasswordSchema,
} from "../src/lib/validation";
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
import { applyMessageEvent, mergeMessages, messageOf } from "../src/features/chat/message-utils";
import { boardUpdateSchema, commentSchema, projectSchema, sprintSchema, ticketFilterSchema, ticketSchema, ticketUpdateSchema } from "../src/lib/validation";
import { initials, priorityOf, trackerHref } from "../src/features/tickets/ui";
import type { ChatMessage } from "../src/lib/chat-types";
import { sendPasswordResetEmail } from "../src/lib/mailer";
import { createHmac } from "node:crypto";
import { parsePullRequestUrl, ticketKeysIn } from "../src/features/integrations/refs";
import { fullNameSchema, validSignature } from "../src/features/integrations/providers/shared";
import { github } from "../src/features/integrations/providers/github";
import { bitbucket } from "../src/features/integrations/providers/bitbucket";
import { base32Decode, base32Encode, hashRecoveryCode, openSecret, sealSecret, totpCode, verifyTotp } from "../src/lib/totp";
import { parseSearchQuery } from "../src/features/search/service";

test("ticket keys are found in pull request titles and branch names", () => {
  assert.deepEqual(ticketKeysIn("SYN-12 fix login", "SYN"), ["SYN-12"]);
  assert.deepEqual(ticketKeysIn("feature/syn-7-timer and Syn-12, SYN-7 again", "SYN"), ["SYN-7", "SYN-12"]); // any case, no repeats
  assert.deepEqual(ticketKeysIn("[SYN-3] (SYN-004)", "SYN"), ["SYN-3", "SYN-4"]);
  // Part of a longer word or number is not a key, and other projects' keys are ignored.
  assert.deepEqual(ticketKeysIn("XSYN-1 SYN-1x SYN-12345678901 OTH-2 SYN- 5 SYN5", "SYN"), []);
  assert.deepEqual(ticketKeysIn("SYN-1", "SY"), []);
});

test("pull request addresses are read for GitHub and Bitbucket only", () => {
  assert.deepEqual(parsePullRequestUrl("https://github.com/acme/app/pull/12"), { provider: "GITHUB", fullName: "acme/app", number: 12 });
  assert.deepEqual(parsePullRequestUrl(" https://github.com/acme/app/pull/12/files?diff=split "), { provider: "GITHUB", fullName: "acme/app", number: 12 });
  assert.deepEqual(parsePullRequestUrl("https://bitbucket.org/team/site/pull-requests/3"), { provider: "BITBUCKET", fullName: "team/site", number: 3 });
  for (const address of [
    "", "not a url", "http://github.com/acme/app/pull/12", "https://github.com/acme/app/issues/12", "https://github.com/acme/app/pull/abc",
    "https://github.com.evil.test/acme/app/pull/1", "https://bitbucket.org/team/site/pull/3", "https://gitlab.com/acme/app/pull/1",
  ]) assert.equal(parsePullRequestUrl(address), null, address);
});

test("repository names must look like owner/repository", () => {
  for (const name of ["acme/app", "Hazammm/SYNK", "a.b/c_d-e"]) assert.equal(fullNameSchema.safeParse(name).success, true, name);
  for (const name of ["acme", "acme/app/extra", "../etc", "acme/..", "acme/app?x=1", "acme /app", ""]) assert.equal(fullNameSchema.safeParse(name).success, false, name);
});

test("webhook signatures must match the repository's secret over the exact body", () => {
  const body = JSON.stringify({ action: "opened" });
  const sign = (secret: string, text = body) => `sha256=${createHmac("sha256", secret).update(text).digest("hex")}`;
  assert.equal(validSignature("secret", body, sign("secret")), true);
  assert.equal(validSignature("secret", body, sign("other")), false);
  assert.equal(validSignature("secret", `${body} `, sign("secret")), false); // one changed byte
  assert.equal(validSignature("secret", body, sign("secret").slice(7)), false); // missing the sha256= prefix
  assert.equal(validSignature("secret", body, "sha256=abc"), false);
  assert.equal(validSignature("secret", body, null), false);
});

test("GitHub and Bitbucket deliveries map to the same pull request shape", () => {
  const pull = { number: 4, title: "SYN-1 fix", html_url: "https://github.com/acme/app/pull/4", state: "closed", merged_at: "2026-11-14T10:00:00Z", head: { ref: "fix" }, user: { login: "hazam" }, updated_at: "2026-11-14T10:00:00Z" };
  const event = (name: string) => new Headers({ "x-github-event": name });
  const parsed = github.parseWebhook(event("pull_request"), { pull_request: pull, repository: { full_name: "acme/app" } });
  assert.deepEqual([parsed?.fullName, parsed?.pullRequest.status, parsed?.pullRequest.branch, parsed?.pullRequest.author, parsed?.pullRequest.number], ["acme/app", "MERGED", "fix", "hazam", 4]);
  const statusOf = (changes: object) => github.parseWebhook(event("pull_request"), { pull_request: { ...pull, ...changes }, repository: { full_name: "acme/app" } })?.pullRequest.status;
  assert.deepEqual([statusOf({ state: "open", merged_at: null }), statusOf({ merged_at: null }), statusOf({ user: null })], ["OPEN", "DECLINED", "MERGED"]);
  assert.equal(github.parseWebhook(event("ping"), { zen: "Keep it simple." }), null);
  assert.equal(github.parseWebhook(event("pull_request"), { pull_request: { number: "4" } }), null); // not the expected shape

  const hosted = { id: 9, title: "SYN-2 report", state: "OPEN", links: { html: { href: "https://bitbucket.org/team/site/pull-requests/9" } }, updated_on: "2026-11-14T11:00:00Z", source: { branch: { name: "report" } }, author: { display_name: "Asra" } };
  const key = (name: string) => new Headers({ "x-event-key": name });
  const states = ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"].map(state => bitbucket.parseWebhook(key("pullrequest:updated"), { pullrequest: { ...hosted, state }, repository: { full_name: "team/site" } })?.pullRequest.status);
  assert.deepEqual(states, ["OPEN", "MERGED", "DECLINED", "DECLINED"]);
  assert.equal(bitbucket.parseWebhook(key("repo:push"), { pullrequest: hosted, repository: { full_name: "team/site" } }), null);
});

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
test("invite-only account schemas normalize email and enforce password byte limits", () => {
  assert.equal(passwordSchema.safeParse("short").success, false);
  assert.equal(passwordSchema.safeParse("long-enough").success, true);
  assert.equal(passwordSchema.safeParse("😀".repeat(20)).success, false);
  const workspace = createWorkspaceSchema.parse({
    adminName: " Admin ",
    email: "ADMIN@EXAMPLE.COM",
    password: "long-enough",
    workspaceName: "Team",
    inviteEmails: ["PERSON@EXAMPLE.COM"],
  });
  assert.equal(workspace.email, "admin@example.com");
  assert.equal(workspace.projectName, "My first project");
  assert.equal(acceptInviteSchema.safeParse({ name: "Member", password: "short" }).success, false);
  assert.equal(createWorkspaceGoogleSchema.safeParse({ workspaceName: "Team" }).success, true);
  assert.equal(dmChannelSchema.safeParse({ userIds: ["u1"] }).success, true);
  assert.equal(dmChannelSchema.safeParse({ userIds: [] }).success, false);
  assert.match(messageOf(new Error("boom")), /boom/);
});
test("bounded history and channel name validation", () => {
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
test("client drops optimistic rows when the server echoes the same client id", () => {
  const clientId = randomUUID();
  const optimistic: ChatMessage = {
    id: "opt-1",
    channelId: "c",
    body: "hi",
    clientId,
    status: "sending",
    createdAt: "2026-10-17T00:00:00.000Z",
    parentId: null,
    sender: { id: "u", name: "You" },
    replyCount: 0,
  };
  const confirmed: ChatMessage = {
    id: "real-1",
    channelId: "c",
    body: "hi",
    clientId,
    createdAt: "2026-10-17T00:00:01.000Z",
    parentId: null,
    sender: { id: "u", name: "You" },
    replyCount: 0,
    status: "sent",
  };
  const merged = mergeMessages([optimistic], [confirmed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "real-1");
});
test("tiptap bodies validate, extract plain text, and accept attachments metadata", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello team" }] }] };
  const body = JSON.stringify(doc);
  assert.equal(isTiptapDoc(doc), true);
  assert.equal(isTiptapDoc({ type: "paragraph" }), false);
  assert.equal(extractTextFromTiptap(doc), "Hello team");
  assert.equal(extractPlainText(body), "Hello team");
  assert.equal(extractPlainText("plain text"), "plain text");
  assert.equal(messageSchema.safeParse({ body, clientId: "client-key-1", attachmentIds: ["att_1"] }).success, true);
  assert.equal(messageEditSchema.safeParse({ body }).success, true);
  assert.equal(driveImportSchema.safeParse({ fileId: "abc123-_X" }).success, true);
  assert.equal(driveImportSchema.safeParse({ fileId: "../evil" }).success, false);
  const badDoc = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "fake" }] }] }],
  });
  assert.equal(messageSchema.safeParse({ body: badDoc, clientMessageId: randomUUID() }).success, false);
  const longDoc = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(4001) }] }],
  });
  assert.equal(messageSchema.safeParse({ body: longDoc, clientMessageId: randomUUID() }).success, false);
});
test("mailer configuration is required before workspace invites send", async () => {
  const { assertMailerConfigured } = await import("../src/lib/mailer");
  const keys = ["MAILTRAP_API_TOKEN", "MAILTRAP_HOST", "MAILTRAP_PORT", "MAILTRAP_USER", "MAILTRAP_PASS", "MAIL_FROM"] as const;
  const previous = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) Reflect.deleteProperty(process.env, key);
    assert.throws(() => assertMailerConfigured(), /not configured/);
    process.env.MAILTRAP_API_TOKEN = "mailtrap-token";
    assert.throws(() => assertMailerConfigured(), /MAIL_FROM/);
    process.env.MAIL_FROM = "noreply@test.com";
    assert.doesNotThrow(() => assertMailerConfigured());
    Reflect.deleteProperty(process.env, "MAILTRAP_API_TOKEN");
    process.env.MAILTRAP_HOST = "smtp.test";
    process.env.MAILTRAP_PORT = "587";
    process.env.MAILTRAP_USER = "user";
    process.env.MAILTRAP_PASS = "pass";
    assert.doesNotThrow(() => assertMailerConfigured());
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
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
test("password reset email logs a link only when delivery is unconfigured outside production", async () => {
  const keys = ["NODE_ENV", "MAILTRAP_API_TOKEN", "MAILTRAP_HOST", "MAILTRAP_PORT", "MAILTRAP_USER", "MAILTRAP_PASS", "MAIL_FROM"] as const;
  const previous = keys.map(key => [key, process.env[key]] as const);
  const originalLog = console.log;
  const output: string[] = [];
  for (const key of keys) Reflect.deleteProperty(process.env, key);
  Reflect.set(process.env, "NODE_ENV", "development");
  console.log = (...args: Parameters<typeof console.log>) => { output.push(args.join(" ")); };
  try {
    await sendPasswordResetEmail({ email: "person@example.com", resetUrl: "http://localhost:3000/reset-password?token=one-time-token" });
    assert.match(output.join("\n"), /one-time-token/);
    assert.match(output.join("\n"), /dev mode, not emailed/);
  } finally {
    console.log = originalLog;
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
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
  assert.equal(trackerHref("sprints", { workspaceId: "w1", projectId: undefined, ticket: "" }), "/w/w1/board/backlog?workspaceId=w1");
  assert.equal(trackerHref("board", { workspaceId: "w1", projectId: "p1", boardId: "b1", ticket: "t1" }), "/w/w1/board?workspaceId=w1&projectId=p1&boardId=b1&ticket=t1");
  assert.equal(initials("Hazam Liaqat Khan"), "HL"); assert.equal(initials("  asra "), "A"); assert.equal(initials(null), "M");
  assert.equal(priorityOf("LOW").label, "Low");
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
  assert.equal(notificationReadSchema.safeParse({}).success, true);
  assert.equal(notificationReadSchema.safeParse({ ids: ["n1"] }).success, true);
  assert.equal(notificationReadSchema.safeParse({ ids: [] }).success, false);
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
test("time durations count running timers up to now, capped at a day", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");
  assert.equal(entrySeconds({ startedAt: "2026-11-13T10:00:00.000Z", endedAt: "2026-11-13T11:30:00.000Z" }, now), 5400);
  assert.equal(entrySeconds({ startedAt: "2026-11-13T11:59:00.000Z", endedAt: null }, now), 60);
  assert.equal(entrySeconds({ startedAt: "2026-11-11T12:00:00.000Z", endedAt: null }, now), 86400);
  assert.equal(entrySeconds({ startedAt: "2026-11-13T13:00:00.000Z", endedAt: null }, now), 0);
  assert.deepEqual([formatDuration(0), formatDuration(59), formatDuration(2700), formatDuration(7500), formatDuration(36000)], ["0m", "0m", "45m", "2h 05m", "10h 00m"]);
  assert.equal(formatClock(3725), "01:02:05");
  assert.deepEqual([hours(5400), hours(1000)], [1.5, 0.3]);
});
test("time totals group entries by day, ticket and person", () => {
  const now = new Date(2026, 10, 13, 18);
  const entry = (id: string, start: Date, minutes: number, ticket: string, user: string) => ({
    id, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + minutes * 60_000).toISOString(), note: "", mine: user === "u1",
    user: { id: user, name: user === "u1" ? "Asra" : "Bilal" }, ticket: { id: ticket, key: ticket.toUpperCase(), title: ticket, projectId: "p" },
  });
  const entries = [entry("a", new Date(2026, 10, 9, 9), 60, "t1", "u1"), entry("b", new Date(2026, 10, 9, 14), 30, "t2", "u2"), entry("c", new Date(2026, 10, 12, 10), 90, "t1", "u2"), entry("d", new Date(2026, 10, 2, 10), 60, "t1", "u1")];
  assert.deepEqual(secondsByDay(entries, weekDays(new Date(2026, 10, 9)), now), [5400, 0, 0, 5400, 0, 0, 0]); // last week's entry is ignored
  assert.deepEqual(totalsBy(entries.slice(0, 3), e => e.ticket.id, e => e.ticket.title, now).map(g => [g.key, g.seconds]), [["t1", 9000], ["t2", 1800]]);
  assert.deepEqual(totalsBy(entries.slice(0, 3), e => e.user.id, e => e.user.name ?? "", now).map(g => [g.label, g.seconds]), [["Bilal", 7200], ["Asra", 3600]]);
});
test("time schemas need real timestamps, tickets and short notes", () => {
  assert.equal(timerStartSchema.safeParse({ ticketId: "t1" }).success, true);
  assert.equal(timerStartSchema.safeParse({ ticketId: "t1", userId: "someone" }).success, false);
  assert.equal(timeEntrySchema.safeParse({ ticketId: "t1", startedAt: "2026-11-13T09:00:00+05:00", endedAt: "2026-11-13T10:00:00Z" }).success, true);
  assert.equal(timeEntrySchema.safeParse({ ticketId: "t1", startedAt: "2026-11-13", endedAt: "2026-11-13T10:00:00Z" }).success, false);
  assert.equal(timeEntrySchema.safeParse({ ticketId: "t1", startedAt: "2026-11-13T09:00:00Z", endedAt: "2026-11-13T10:00:00Z", note: "x".repeat(501) }).success, false);
  assert.equal(timeListSchema.safeParse({ projectId: "p1", from: "2026-11-09T00:00:00Z", to: "2026-11-16T00:00:00Z" }).success, true);
  assert.equal(timeListSchema.safeParse({ from: "2026-11-09T00:00:00Z", to: "2026-11-16T00:00:00Z" }).success, false);
  assert.equal(can("time:log", { role: "MEMBER", projectLevel: "READ" }), false);
  assert.equal(can("time:read", { role: "MEMBER", projectLevel: "READ" }), true);
  assert.equal(can("time:log", { role: "MEMBER", projectLevel: "WRITE" }), true);
});

test("the Google sign-up cookie refuses to work without NEXTAUTH_SECRET", async () => {
  const { encryptGoogleProfile, decryptGoogleProfile } = await import("../src/lib/google-profile-cookie");
  const saved = process.env.NEXTAUTH_SECRET;
  const profile = { email: "person@example.test", name: "Person", providerAccountId: "1" };
  try {
    process.env.NEXTAUTH_SECRET = "unit-test-secret-that-is-long-enough-1234";
    assert.deepEqual(await decryptGoogleProfile(await encryptGoogleProfile(profile)), { ...profile, image: undefined });
    delete process.env.NEXTAUTH_SECRET;
    await assert.rejects(encryptGoogleProfile(profile), /NEXTAUTH_SECRET/);
  } finally {
    if (saved === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = saved;
  }
});

test("client sorts messages with stable ids on identical timestamps", () => {
  const later: ChatMessage = { id: "b", channelId: "c", body: "2", createdAt: "2026-10-17T00:00:00.000Z", parentId: null, sender: { id: "u", name: "U" }, replyCount: 0 };
  const earlierId: ChatMessage = { id: "a", channelId: "c", body: "1", createdAt: "2026-10-17T00:00:00.000Z", parentId: null, sender: { id: "u", name: "U" }, replyCount: 0 };
  assert.deepEqual(mergeMessages([], [later, earlierId]).map(message => message.id), ["a", "b"]);
});
test("google Drive helpers build safe queries and file names", async () => {
  const { driveSearchQuery, googleDriveConfigured, hasDriveScope, safeDriveFileName } = await import(
    "../src/lib/google-drive-helpers"
  );
  const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
  const previous = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) Reflect.deleteProperty(process.env, key);
    assert.equal(googleDriveConfigured(), false);
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    assert.equal(googleDriveConfigured(), true);
    assert.equal(hasDriveScope("openid https://www.googleapis.com/auth/drive.readonly"), true);
    assert.equal(hasDriveScope("openid"), false);
    assert.match(driveSearchQuery("Q1' report"), /name contains 'Q1 report'/);
    assert.match(driveSearchQuery("   "), /trashed = false/);
    assert.equal(safeDriveFileName("Deck", ".pdf"), "Deck.pdf");
    assert.equal(safeDriveFileName("bad:name", ".docx"), "bad_name.docx");
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
});
test("client applies thread reply counts from live events", () => {
  const parent: ChatMessage = {
    id: "parent",
    channelId: "c",
    body: "root",
    createdAt: "2026-10-17T00:00:00.000Z",
    parentId: null,
    sender: { id: "u", name: "User" },
    replyCount: 1,
  };
  const updated = applyMessageEvent([parent], { message: { ...parent, id: "child", parentId: "parent" }, parentReplyCount: 4 }, null);
  assert.equal(updated[0].replyCount, 4);
  const reply: ChatMessage = {
    id: "child",
    channelId: "c",
    body: "reply",
    createdAt: "2026-10-17T00:00:01.000Z",
    parentId: "parent",
    threadRootId: "parent",
    sender: { id: "u", name: "User" },
    replyCount: 0,
  };
  const merged = applyMessageEvent([], { message: reply, parentReplyCount: 0 }, "parent");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "child");
});

test("a thread reply also sent to the channel appears in the channel feed", () => {
  const parent: ChatMessage = { id: "parent", channelId: "c", body: "root", createdAt: "2026-10-17T00:00:00.000Z", sender: { id: "u", name: "User" }, replyCount: 0 };
  const reply: ChatMessage = { ...parent, id: "child", createdAt: "2026-10-17T00:00:01.000Z", threadRootId: "parent", parentId: "parent" };
  assert.deepEqual(applyMessageEvent([parent], { message: reply, parentReplyCount: 1 }, null).map(item => item.id), ["parent"]);
  const shared = applyMessageEvent([parent], { message: { ...reply, alsoInChannel: true }, parentReplyCount: 1 }, null);
  assert.deepEqual(shared.map(item => item.id), ["parent", "child"]);
  assert.equal(shared[0].replyCount, 1);
});
test("google profile cookie headers set and clear the pending profile", async () => {
  const { googleProfileCookieHeader, clearGoogleProfileCookieHeader, GOOGLE_PROFILE_COOKIE } = await import("../src/lib/google-profile-cookie");
  assert.match(googleProfileCookieHeader("signed-token"), new RegExp(`${GOOGLE_PROFILE_COOKIE}=signed-token`));
  assert.match(clearGoogleProfileCookieHeader(), /Max-Age=0/);
});
test("agent client refuses calls when the service is not configured", async () => {
  const { forgetAgentThreads, callAgent } = await import("../src/features/agent/client");
  const savedUrl = process.env.AI_SERVICE_URL;
  const savedSecret = process.env.AI_SERVICE_SECRET;
  const originalFetch = globalThis.fetch;
  assert.equal(await forgetAgentThreads([]), true);
  delete process.env.AI_SERVICE_URL;
  delete process.env.AI_SERVICE_SECRET;
  assert.equal(await forgetAgentThreads(["thread-1"]), false);
  await assert.rejects(callAgent({ workspaceId: "w", message: "hi" } as never), /not set up/);
  process.env.AI_SERVICE_URL = "http://127.0.0.1:9/";
  process.env.AI_SERVICE_SECRET = "secret";
  globalThis.fetch = async () => new Response(JSON.stringify({ reply: "Done", actions: [], pending: null }), { status: 200 });
  const configured = await import("../src/features/agent/client");
  assert.equal(await configured.forgetAgentThreads(["thread-1"]), true);
  const answer = await configured.callAgent({ workspaceId: "w", message: "hello" } as never);
  assert.equal(answer.reply, "Done");
  globalThis.fetch = async () => new Response("{not-json", { status: 200 });
  await assert.rejects(configured.callAgent({ workspaceId: "w", message: "hello" } as never), /could not read/);
  if (savedUrl === undefined) delete process.env.AI_SERVICE_URL;
  else process.env.AI_SERVICE_URL = savedUrl;
  if (savedSecret === undefined) delete process.env.AI_SERVICE_SECRET;
  else process.env.AI_SERVICE_SECRET = savedSecret;
  globalThis.fetch = originalFetch;
});
test("Bitbucket OAuth profile maps uuid and primary email", async () => {
  const { Bitbucket } = await import("../src/lib/bitbucket-provider");
  const provider = Bitbucket({ clientId: "id", clientSecret: "secret" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/user/emails")) {
      return new Response(JSON.stringify({ values: [{ email: "Person@Example.com", is_primary: true, is_confirmed: true }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ uuid: "uuid-1", display_name: "Person", links: { avatar: { href: "https://avatar" } } }), { status: 200 });
  };
  try {
    const userinfo = provider.userinfo as { request: (ctx: { tokens: { access_token: string } }) => Promise<Record<string, unknown>> };
    const profile = await userinfo.request({ tokens: { access_token: "tok" } });
    assert.equal(profile.email, "person@example.com");
    assert.deepEqual(provider.profile!(profile as never, {} as never), { id: "uuid-1", name: "Person", email: "person@example.com", image: "https://avatar" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("typing indicators name up to two people", async () => {
  const { typingText } = await import("../src/features/chat/message-utils");
  assert.equal(typingText([]), "");
  assert.equal(typingText(["Asra"]), "Asra is typing…");
  assert.equal(typingText(["Asra", "Bilal"]), "Asra and Bilal are typing…");
  assert.equal(typingText(["Asra", "Bilal", "Sara"]), "Several people are typing…");
});

test("rich-text messages are validated and their plain text is extracted", async () => {
  const { extractPlainText } = await import("../src/lib/validation");
  const doc = (content: object[]) => JSON.stringify({ type: "doc", content });
  const hello = doc([{ type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "text", text: "SYN-1", marks: [{ type: "bold" }] }] }]);
  assert.equal(extractPlainText(hello), "Hello SYN-1");
  assert.equal(extractPlainText("Plain text stays as it is"), "Plain text stays as it is");
  assert.equal(messageSchema.safeParse({ body: hello, clientMessageId: randomUUID() }).success, true);
  const badMark = doc([{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "script" }] }] }]);
  assert.equal(messageSchema.safeParse({ body: badMark, clientMessageId: randomUUID() }).success, false);
  const tooLong = doc([{ type: "paragraph", content: [{ type: "text", text: "a".repeat(4001) }] }]);
  assert.equal(messageSchema.safeParse({ body: tooLong, clientMessageId: randomUUID() }).success, false);
});

test("one-time codes match RFC 6238 and allow one step of clock drift", () => {
  // RFC 6238 test secret: the ASCII bytes "12345678901234567890".
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(totpCode(secret, 59_000, 8), "94287082");
  assert.equal(totpCode(secret, 1_111_111_109_000, 8), "07081804");
  assert.equal(totpCode(secret, 59_000), "287082");
  assert.equal(verifyTotp(secret, "287 082", 59_000), true);
  assert.equal(verifyTotp(secret, totpCode(secret, 59_000), 59_000 + 30_000), true);
  assert.equal(verifyTotp(secret, totpCode(secret, 59_000), 59_000 + 90_000), false);
  assert.equal(verifyTotp(secret, "28708", 59_000), false);
  assert.deepEqual(base32Decode("gezd gnbv-gy3t qojq"), Buffer.from("1234567890"));
  assert.throws(() => base32Decode("not base32!"));
  assert.equal(hashRecoveryCode("ABCDE-12345"), hashRecoveryCode("abcde12345"));
});

test("two-factor secrets are sealed with authenticated encryption", () => {
  process.env.NEXTAUTH_SECRET ||= "unit-test-secret";
  const sealed = sealSecret("JBSWY3DPEHPK3PXP");
  assert.notEqual(sealed, sealSecret("JBSWY3DPEHPK3PXP"));
  assert.ok(!sealed.includes("JBSWY3DPEHPK3PXP"));
  assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
  const [iv, tag, data] = sealed.split(".");
  assert.throws(() => openSecret([iv, tag, data.slice(0, -2) + (data.endsWith("A") ? "BB" : "AA")].join(".")));
});

test("custom emoji shortcodes normalize and reject punctuation", async () => {
  const { isValidShortcode, normalizeShortcode, wrapShortcode, isCustomReaction } = await import("../src/lib/emoji-shortcode");
  assert.equal(normalizeShortcode(":Party-Parrot:"), "party-parrot");
  assert.equal(isValidShortcode("party-parrot"), true);
  assert.equal(isValidShortcode("a"), false);
  assert.equal(isValidShortcode("Party_Parrot"), false);
  assert.equal(wrapShortcode("ship-it"), ":ship-it:");
  assert.equal(isCustomReaction(":ship-it:"), true);
  assert.equal(isCustomReaction("👍"), false);
});

test("unfurl URL extraction blocks private hosts and skips Drive", async () => {
  const { extractHttpUrls, isPrivateIp, parsePublicHttpUrl, hostnameIsDrive } = await import("../src/lib/unfurl-ssrf");
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.0.0.8"), true);
  assert.equal(isPrivateIp("192.168.1.1"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
  assert.equal(parsePublicHttpUrl("http://127.0.0.1/secret"), null);
  assert.equal(parsePublicHttpUrl("http://localhost/admin"), null);
  assert.equal(parsePublicHttpUrl("https://example.com/a")?.href, "https://example.com/a");
  assert.equal(hostnameIsDrive("docs.google.com"), true);
  assert.deepEqual(extractHttpUrls("see https://example.com/x and http://127.0.0.1/no"), ["https://example.com/x"]);
});

test("join policy matches email domains and Open Graph tags parse", async () => {
  const { emailMatchesDomains, parseEmailDomains, isValidEmailDomain } = await import("../src/lib/join-policy");
  assert.equal(isValidEmailDomain("acme.com"), true);
  assert.deepEqual(parseEmailDomains(["ACME.com", "acme.com"]), ["acme.com"]);
  assert.equal(emailMatchesDomains("ada@acme.com", ["acme.com"]), true);
  assert.equal(emailMatchesDomains("ada@mail.acme.com", ["acme.com"]), true);
  assert.equal(emailMatchesDomains("ada@other.test", ["acme.com"]), false);
  assert.equal(emailMatchesDomains("ada@other.test", []), true);
  const { parseOpenGraph } = await import("../src/lib/og-parse");
  const og = parseOpenGraph('<meta property="og:title" content="Hello &amp; Co"><title>Fallback</title><meta name="description" content="A page">', "https://example.com");
  assert.equal(og.title, "Hello & Co");
  assert.equal(og.description, "A page");
});

test("reminder slash commands parse relative and dated times", async () => {
  const { parseRemindCommand, parseReminderWhen } = await import("../src/lib/reminder-parse");
  const now = new Date("2026-11-23T12:00:00");
  assert.equal(parseReminderWhen("20m", now)?.toISOString(), new Date(now.getTime() + 20 * 60_000).toISOString());
  assert.equal(parseRemindCommand("/remind in 1h standup", now)?.text, "standup");
  assert.equal(parseRemindCommand("not a reminder", now), null);
});

test("poll, webhook, schedule and emoji schemas reject incomplete input", async () => {
  const { pollSchema, webhookPostSchema, scheduledMessageSchema, emojiShortcodeSchema } = await import("../src/lib/validation");
  assert.equal(pollSchema.safeParse({ question: "Ship?", options: ["Yes", "No"] }).success, true);
  assert.equal(pollSchema.safeParse({ question: "Ship?", options: ["Only one"] }).success, false);
  assert.equal(webhookPostSchema.safeParse({ text: "hello" }).success, true);
  assert.equal(emojiShortcodeSchema.safeParse("party-parrot").success, true);
  const soon = new Date(Date.now() + 60_000).toISOString();
  assert.equal(scheduledMessageSchema.safeParse({ body: "later", clientMessageId: randomUUID(), sendAt: soon }).success, true);
});

test("search modifiers are read from the query and the rest is searched as text", () => {
  const filters = parseSearchQuery("deploy from:@sam in:#Dev-Ops before:2026-11-01 after:2026-10-01 has:link has:file notes");
  assert.equal(filters.text, "deploy notes");
  assert.equal(filters.from, "sam");
  assert.equal(filters.in, "dev-ops");
  assert.equal(filters.before?.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(filters.after?.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.deepEqual(filters.has, ["link", "file"]);
  assert.equal(parseSearchQuery("from:\"Asra Khan\" hello").from, "Asra Khan");
  // Unknown or malformed modifiers stay part of the text.
  assert.deepEqual(parseSearchQuery("before:yesterday has:emoji http://x").text, "before:yesterday has:emoji http://x");
  assert.deepEqual(parseSearchQuery("plain words"), { text: "plain words", has: [] });
});
