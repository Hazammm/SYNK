import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { can, type Action } from "../src/lib/permissions";
import { channelSchema, historySchema, messageSchema, registerSchema } from "../src/lib/validation";
import { assertSameOrigin, readJson } from "../src/lib/http";
import { mergeMessages } from "../src/features/chat/client";
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
