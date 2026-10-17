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
const { db } = await import("../src/lib/db");
const { createWorkspace, listWorkspaces, addMember, removeMember } = await import("../src/features/workspaces/service");
const { createChannel, listChannels, joinChannel, addChannelMember, listMessages, sendMessage } = await import("../src/features/chat/service");
const { attachRealtime } = await import("../src/server/socket");
const { setRealtime } = await import("../src/lib/realtime");
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
