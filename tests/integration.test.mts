import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { io as connect, type Socket } from "socket.io-client";
import nextEnv from "@next/env";
import type { ServerEvents, ClientEvents, MessageEvent, Ack } from "../src/lib/chat-types";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NEXTAUTH_SECRET ??= "integration-only-not-a-production-secret-123456789";
process.env.NEXTAUTH_URL = "http://localhost:3000";
// Never send real email from tests, even when a provider is configured locally.
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
const { db } = await import("../src/lib/db");
const { createWorkspace, listWorkspaces, addMember, removeMember } = await import("../src/features/workspaces/service");
const { createChannel, listChannels, joinChannel, addChannelMember, listMessages, sendMessage } = await import("../src/features/chat/service");
const { attachRealtime } = await import("../src/server/socket");
const { setRealtime } = await import("../src/lib/realtime");
const { POST: forgotPasswordRoute } = await import("../src/app/api/auth/forgot-password/route");
const { POST: resetPasswordRoute } = await import("../src/app/api/auth/reset-password/route");
const { issuePasswordReset, RESEND_COOLDOWN_MS } = await import("../src/lib/password-reset");
const { authOptions, createPasswordLogin } = await import("../src/lib/auth");
const { compare, hash } = await import("bcryptjs");
const { createHash } = await import("node:crypto");
const http = createServer((_request, response) => response.end());
let realtime: ReturnType<typeof attachRealtime>;
let url: string;
let admin: string, member: string, outsider: string, workspaceId: string, otherWorkspaceId: string, channelId: string;
const users: string[] = [];
const workspaces: string[] = [];
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
const input = (body: string, parentId?: string) => ({ body, parentId, clientMessageId: randomUUID() });
const denied = (promise: Promise<unknown>) => assert.rejects(promise, (error: unknown) => (error as { status: number }).status === 403);

before(async () => {
  for (const name of ["Admin", "Member", "Outsider"]) {
    const user = await db.user.create({ data: { name, email: `synk-it-${randomUUID()}@example.test` } }); users.push(user.id);
  }
  [admin, member, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Integration workspace" })).id;
  otherWorkspaceId = (await createWorkspace(outsider, { name: "Other workspace" })).id;
  workspaces.push(workspaceId, otherWorkspaceId);
  await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id: member } })).email);
  channelId = (await listChannels(admin, workspaceId))[0].id;
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  process.env.NEXTAUTH_URL = url;
  realtime = attachRealtime(http);
});

after(async () => {
  sockets.forEach(socket => socket.disconnect());
  if (realtime) await new Promise<void>(resolve => realtime.close(() => resolve()));
  setRealtime(undefined);
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

async function cookie(userId: string, maxAge = 3600) {
  const session = await db.loginSession.create({ data: { userId, expiresAt: new Date(Date.now() + maxAge * 1000) } });
  const token = await encode({ token: { sub: userId, sessionId: session.id }, secret: process.env.NEXTAUTH_SECRET!, maxAge });
  return { value: `next-auth.session-token=${token}`, sessionId: session.id };
}
async function socketFor(cookieValue?: string, origin = url) {
  const socket: Socket<ServerEvents, ClientEvents> = connect(url, { transports: ["websocket"], autoConnect: false, reconnection: false, extraHeaders: { Origin: origin, ...(cookieValue ? { Cookie: cookieValue } : {}) } });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  return socket;
}
const subscribe = (socket: Socket<ServerEvents, ClientEvents>, channel: string) => new Promise<Ack>((resolve, reject) => socket.timeout(3000).emit("channel:join", { channelId: channel }, (error, result) => error ? reject(error) : resolve(result)));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("workspace creation is atomic, and discovery excludes other tenants", async () => {
  const result = await listWorkspaces(admin);
  assert.deepEqual(result.map(item => item.id), [workspaceId]);
  assert.equal(result[0].role, "ADMIN");
  await denied(listChannels(outsider, workspaceId));
  await denied(createChannel(outsider, workspaceId, { name: "forbidden" }));
  await denied(addMember(member, workspaceId, "nobody@example.test"));
});
test("workspace membership alone never grants channel history or writes", async () => {
  await denied(listMessages(member, channelId, {}));
  await denied(sendMessage(member, channelId, input("blocked")));
  await joinChannel(member, channelId);
  const message = await sendMessage(member, channelId, input("joined successfully"));
  assert.equal(message.sender.id, member);
  await denied(listMessages(outsider, channelId, {}));
  await denied(sendMessage(outsider, channelId, input("blocked")));
});
test("private channels are hidden and cannot be self-joined", async () => {
  const secret = await createChannel(admin, workspaceId, { name: "private-plans", isPrivate: true });
  assert.equal((await listChannels(member, workspaceId)).some(row => row.id === secret.id), false);
  await denied(joinChannel(member, secret.id));
  await denied(addChannelMember(member, secret.id, member));
  await denied(addChannelMember(admin, secret.id, outsider));
  await addChannelMember(admin, secret.id, member);
  assert.equal((await listChannels(member, workspaceId)).find(row => row.id === secret.id)?.joined, true);
  const memberOwned = await createChannel(member, workspaceId, { name: "member-private", isPrivate: true });
  assert.equal((await listChannels(member, workspaceId)).find(row => row.id === memberOwned.id)?.canManageMembers, true);
  await addChannelMember(member, memberOwned.id, admin);
  assert.equal((await listChannels(admin, workspaceId)).find(row => row.id === memberOwned.id)?.joined, true);
});
test("message retries persist once and conflicting retries are rejected", async () => {
  const data = input("send exactly once");
  const [a, b] = await Promise.all([sendMessage(admin, channelId, data), sendMessage(admin, channelId, data)]);
  assert.equal(a.id, b.id);
  assert.equal(await db.message.count({ where: { clientMessageId: data.clientMessageId } }), 1);
  await assert.rejects(sendMessage(admin, channelId, { ...data, body: "changed" }), /different content/);
});
test("thread parents must be top-level messages in the same channel", async () => {
  const root = await sendMessage(admin, channelId, input("thread root"));
  const reply = await sendMessage(member, channelId, input("reply", root.id));
  const page = await listMessages(member, channelId, { parentId: root.id });
  assert.deepEqual(page.messages.map(message => message.id), [reply.id]);
  await assert.rejects(sendMessage(member, channelId, input("nested reply", reply.id)), /top-level/);
  const otherChannel = await createChannel(admin, workspaceId, { name: "second" });
  await assert.rejects(sendMessage(admin, otherChannel.id, input("wrong channel", root.id)), /top-level/);
  await assert.rejects(listMessages(admin, otherChannel.id, { parentId: root.id }), /Thread not found/);
});
test("cursor pages are stable with identical timestamps and reject foreign cursors", async () => {
  const channel = await createChannel(admin, workspaceId, { name: "pagination" });
  const stamp = new Date("2026-10-01T00:00:00.000Z");
  for (let i = 0; i < 7; i++) await db.message.create({ data: { id: `pagination-${randomUUID()}-${i}`, channelId: channel.id, senderId: admin, body: String(i), clientMessageId: randomUUID(), createdAt: stamp } });
  const ids: string[] = []; let cursor: string | undefined;
  do { const page = await listMessages(admin, channel.id, { limit: 2, cursor }); ids.push(...page.messages.map(row => row.id)); cursor = page.nextCursor ?? undefined; } while (cursor);
  assert.equal(ids.length, 7); assert.equal(new Set(ids).size, 7);
  await assert.rejects(listMessages(admin, channelId, { cursor: ids[0] }), /Invalid cursor/);
});
test("relational constraints reject cross-workspace channel membership", async () => {
  await assert.rejects(db.channelMember.create({ data: { channelId, workspaceId: otherWorkspaceId, userId: outsider } }), (error: unknown) => (error as { code: string }).code === "P2003");
  // Start the next checks with a fresh connection after deliberately provoking a server constraint error.
  await db.$disconnect();
});
test("socket handshakes reject missing, forged, expired cookies and foreign origins", async () => {
  await assert.rejects(socketFor());
  await assert.rejects(socketFor("next-auth.session-token=forged"));
  await assert.rejects(socketFor((await cookie(admin, -60)).value));
  await assert.rejects(socketFor((await cookie(admin)).value, "https://attacker.example"));
});
test("only authorized sockets receive live events, including after channel access revocation", async () => {
  const allowed = await socketFor((await cookie(member)).value);
  assert.equal((await subscribe(allowed, channelId)).ok, true);
  const forbidden = await socketFor((await cookie(outsider)).value);
  assert.equal((await subscribe(forbidden, channelId)).ok, false);
  const received: MessageEvent[] = []; const leaked: MessageEvent[] = [];
  allowed.on("message:created", event => received.push(event)); forbidden.on("message:created", event => leaked.push(event));
  await sendMessage(admin, channelId, input("live message"));
  await delay(100);
  assert.equal(received.length, 1); assert.equal(leaked.length, 0);
  await db.channelMember.delete({ where: { channelId_userId: { channelId, userId: member } } });
  await sendMessage(admin, channelId, input("must not leak after removal"));
  await delay(100);
  assert.equal(received.length, 1);
  await joinChannel(member, channelId);
});
test("same-origin polling can authenticate when the browser omits Origin", async () => {
  const auth = await cookie(admin);
  const socket: Socket<ServerEvents, ClientEvents> = connect(url, { transports: ["polling"], autoConnect: false, reconnection: false,
    extraHeaders: { Cookie: auth.value, "Sec-Fetch-Site": "same-origin" } });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  assert.equal((await subscribe(socket, channelId)).ok, true);
});
test("revoked sessions stop receiving and cannot reconnect with old cookies", async () => {
  const auth = await cookie(member);
  const socket = await socketFor(auth.value);
  assert.equal((await subscribe(socket, channelId)).ok, true);
  const received: MessageEvent[] = []; socket.on("message:created", event => received.push(event));
  await db.loginSession.delete({ where: { id: auth.sessionId } });
  await sendMessage(admin, channelId, input("revoked session")); await delay(100);
  assert.equal(received.length, 0); assert.equal(socket.connected, false);
  await assert.rejects(socketFor(auth.value));
});
test("reconnect sees persisted missed messages and workspace removal cascades access", async () => {
  const auth = await cookie(member);
  const socket = await socketFor(auth.value);
  await subscribe(socket, channelId); socket.disconnect();
  const missed = await sendMessage(admin, channelId, input("offline message"));
  const reconnected = await socketFor(auth.value); await subscribe(reconnected, channelId);
  assert.ok((await listMessages(member, channelId, {})).messages.some(row => row.id === missed.id));
  await removeMember(admin, workspaceId, member);
  assert.equal(await db.channelMember.count({ where: { userId: member, workspaceId } }), 0);
  await denied(listMessages(member, channelId, {}));
  await denied(sendMessage(member, channelId, input("removed")));
});

test("forgot password generates token hash and defends against user enumeration", async () => {
  const testEmail = `pwd-test-${randomUUID()}@example.test`;
  const user = await db.user.create({
    data: { name: "PwdUser", email: testEmail, passwordHash: await hash("OldPassword123!", 12) },
  });
  users.push(user.id);

  // 1. Request reset for existing user
  const req1 = new Request(`${url}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ email: testEmail }),
  });
  const res1 = await forgotPasswordRoute(req1);
  assert.equal(res1.status, 200);
  const data1 = await res1.json() as { message: string };
  assert.ok(data1.message.includes("reset link"));

  // The token is issued after the response, so timing can't reveal the account.
  let tokens = await db.passwordResetToken.findMany({ where: { userId: user.id } });
  for (let attempt = 0; attempt < 100 && tokens.length === 0; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    tokens = await db.passwordResetToken.findMany({ where: { userId: user.id } });
  }
  assert.equal(tokens.length, 1);
  assert.ok(tokens[0].expiresAt.getTime() > Date.now());

  // 2. Request reset for non-existent user (anti-enumeration)
  const req2 = new Request(`${url}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ email: `nonexistent-${randomUUID()}@example.test` }),
  });
  const res2 = await forgotPasswordRoute(req2);
  assert.equal(res2.status, 200);
  const data2 = await res2.json() as { message: string };
  assert.equal(data1.message, data2.message); // exact same generic message
});

test("reset password updates hash, revokes sessions, and prevents replay", async () => {
  const testEmail = `pwd-reset-${randomUUID()}@example.test`;
  const initialHash = await hash("OldPassword123!", 12);
  const user = await db.user.create({
    data: { name: "ResetUser", email: testEmail, passwordHash: initialHash },
  });
  users.push(user.id);

  // Create an active login session that must be revoked after reset
  const activeSession = await db.loginSession.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
  });

  // Issue a reset token
  const rawToken = "super-secret-token-hex-1234567890";
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });

  // 1. Invalid token should fail with 400
  const invalidReq = new Request(`${url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ token: "invalid-token", password: "BrandNewPassword123!" }),
  });
  const invalidRes = await resetPasswordRoute(invalidReq);
  assert.equal(invalidRes.status, 400);

  // 2. Valid reset should succeed
  const validReq = new Request(`${url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ token: rawToken, password: "BrandNewPassword123!" }),
  });
  const validRes = await resetPasswordRoute(validReq);
  assert.equal(validRes.status, 200);

  // 3. Verify user's passwordHash has updated
  const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.notEqual(updatedUser.passwordHash, initialHash);
  assert.equal(await compare("BrandNewPassword123!", updatedUser.passwordHash!), true);

  // 4. Verify previous sessions are revoked
  const remainingSessions = await db.loginSession.count({ where: { id: activeSession.id } });
  assert.equal(remainingSessions, 0);

  // 5. Verify token was consumed and cannot be reused
  const replayReq = new Request(`${url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ token: rawToken, password: "AnotherNewPassword123!" }),
  });
  const replayRes = await resetPasswordRoute(replayReq);
  assert.equal(replayRes.status, 400);
});

test("concurrent resets with the same link: exactly one succeeds", async () => {
  const user = await db.user.create({
    data: { name: "RaceUser", email: `pwd-race-${randomUUID()}@example.test`, passwordHash: await hash("OldPassword123!", 12) },
  });
  users.push(user.id);
  const rawToken = `race-${randomUUID()}`;
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt: new Date(Date.now() + 15 * 60_000) },
  });

  const attempt = (password: string) => resetPasswordRoute(new Request(`${url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ token: rawToken, password }),
  }));
  const statuses = (await Promise.all([attempt("FirstNewPassword123!"), attempt("SecondNewPassword123!")])).map(res => res.status).sort();
  assert.deepEqual(statuses, [200, 400]);
});

test("forgot password never issues a token to an OAuth-only account", async () => {
  const email = `oauth-only-${randomUUID()}@example.test`;
  const user = await db.user.create({ data: { name: "OAuthUser", email } });
  users.push(user.id);
  await issuePasswordReset(email);
  assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 0);
});

const resetUser = async (label: string) => {
  const email = `${label}-${randomUUID()}@example.test`;
  const user = await db.user.create({ data: { name: label, email, passwordHash: await hash("OldPassword123!", 12) } });
  users.push(user.id);
  return { email, user };
};
const ageTokens = (userId: string) => db.passwordResetToken.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 1000) } });

test("concurrent forgot-password requests issue exactly one link", async () => {
  const { email, user } = await resetUser("pwd-forgot-race");
  await Promise.all([issuePasswordReset(email), issuePasswordReset(email), issuePasswordReset(email)]);
  assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 1);
});

test("forgot password requests during the cooldown are ignored and keep the link", async () => {
  const { email, user } = await resetUser("pwd-forgot-cooldown");
  await issuePasswordReset(email);
  const [first] = await db.passwordResetToken.findMany({ where: { userId: user.id } });
  await issuePasswordReset(email);
  const tokens = await db.passwordResetToken.findMany({ where: { userId: user.id } });
  assert.deepEqual(tokens.map(token => token.id), [first.id]);
});

test("a new request after the cooldown keeps the earlier link and purges expired ones", async () => {
  const { email, user } = await resetUser("pwd-forgot-multiple");
  await issuePasswordReset(email);
  await ageTokens(user.id);
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: randomUUID(), createdAt: new Date(0), expiresAt: new Date(Date.now() - 1000) } });
  await issuePasswordReset(email);
  const tokens = await db.passwordResetToken.findMany({ where: { userId: user.id } });
  assert.equal(tokens.length, 2);
  assert.ok(tokens.every(token => token.expiresAt.getTime() > Date.now()));
});

test("a failed email send removes only the new link, so the user can retry", async () => {
  const { email, user } = await resetUser("pwd-forgot-send-failure");
  await issuePasswordReset(email);
  await ageTokens(user.id);
  const [earlier] = await db.passwordResetToken.findMany({ where: { userId: user.id } });

  const realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Synk <test@example.test>";
  globalThis.fetch = async () => new Response(null, { status: 500 });
  try {
    await assert.rejects(issuePasswordReset(email), /Email provider responded 500/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  }
  const tokens = await db.passwordResetToken.findMany({ where: { userId: user.id } });
  assert.deepEqual(tokens.map(token => token.id), [earlier.id]);

  await issuePasswordReset(email);
  assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 2);
});

test("a password login is refused if the password changed during verification", async () => {
  const { user } = await resetUser("pwd-login-race");
  const stale = await createPasswordLogin(user.id, "$2b$12$a-hash-that-was-replaced");
  assert.equal(stale, null);
  assert.equal(await db.loginSession.count({ where: { userId: user.id } }), 0);

  const loginId = await createPasswordLogin(user.id, user.passwordHash!);
  assert.equal((await db.loginSession.findUniqueOrThrow({ where: { id: loginId! } })).userId, user.id);
});

test("one client's failed logins can't lock an account for other clients", async () => {
  const { email } = await resetUser("login-lockout");
  const { authorize } = (authOptions.providers[0] as unknown as { options: { authorize: (input: object, request: object) => Promise<{ id: string } | null> } }).options;
  const attempt = (password: string, ip: string) => authorize({ email, password }, { headers: { "x-synk-client-ip": ip } });

  for (let count = 0; count < 10; count++) assert.equal(await attempt("WrongPassword123!", "198.51.100.1"), null);
  await assert.rejects(attempt("OldPassword123!", "198.51.100.1"), /Too many requests/);

  assert.ok((await attempt("OldPassword123!", "198.51.100.2"))?.id);
});
