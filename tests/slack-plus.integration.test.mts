import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
for (const name of ["MAILTRAP_HOST", "MAILTRAP_PORT", "MAILTRAP_USER", "MAILTRAP_PASS", "MAILTRAP_API_TOKEN", "MAIL_FROM"]) process.env[name] = "";
process.env.NEXTAUTH_SECRET ||= "test-secret-for-slack-plus";

const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createChannel, joinChannel, listChannels, mentionedIn, sendMessage } = await import("../src/features/chat/service");
const { createGroup } = await import("../src/features/groups/service");
const { createPoll, votePoll } = await import("../src/features/polls/service");
const { scheduleMessage, deliverDueScheduled, cancelScheduled } = await import("../src/features/schedule/service");
const { createReminder, deliverDueReminders } = await import("../src/features/reminders/service");
const { createWebhook, postWebhook } = await import("../src/features/apps/service");
const { updateWorkspaceSettings } = await import("../src/features/workspaces/admin");
const { createInvites } = await import("../src/features/workspaces/invites");
const { isValidShortcode } = await import("../src/lib/emoji-shortcode");
const { assertSafeUnfurlUrl, urlsToUnfurl } = await import("../src/features/unfurl/service");

let admin: string, asra: string, workspaceId: string, generalId: string;
const users: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;

before(async () => {
  for (const name of ["Plus Admin", "Plus Asra"]) {
    users.push((await db.user.create({ data: { name, email: `synk-plus-${randomUUID()}@example.test` } })).id);
  }
  [admin, asra] = users;
  workspaceId = (await createWorkspace(admin, { name: "Plus workspace" })).id;
  await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id: asra } })).email);
  generalId = (await listChannels(admin, workspaceId)).find(channel => channel.isDefault)!.id;
  await joinChannel(asra, generalId);
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("group mentions expand only to members who are in the channel", async () => {
  const room = await createChannel(admin, workspaceId, { name: "plus-group-room" });
  await joinChannel(asra, room.id);
  await createGroup(admin, workspaceId, { name: "Engineering", handle: "eng", userIds: [admin, asra] });
  const people = [{ id: admin, name: "Plus Admin" }, { id: asra, name: "Plus Asra" }];
  const groups = [{ handle: "eng", memberIds: [admin, asra, "nobody"] }];
  assert.deepEqual(mentionedIn("hi @eng", people, groups).userIds.sort(), [admin, asra].sort());
  const message = await sendMessage(admin, room.id, { body: "please look @eng", clientMessageId: randomUUID() });
  const mentions = await db.mention.findMany({ where: { messageId: message.id } });
  assert.equal(mentions.filter(item => item.kind === "USER").length, 2);
});

test("poll votes update counts and reject a second option when single-select", async () => {
  const message = await createPoll(admin, generalId, { question: "Ship Friday?", options: ["Yes", "No"], multiSelect: false });
  assert.ok(message.poll);
  const yes = message.poll!.options[0].id;
  const no = message.poll!.options[1].id;
  const voted = await votePoll(asra, message.poll!.id, { optionIds: [yes] });
  assert.equal(voted.options.find(option => option.id === yes)?.count, 1);
  await assert.rejects(() => votePoll(asra, message.poll!.id, { optionIds: [yes, no] }), status(400));
});

test("scheduled messages deliver when due and can be cancelled", async () => {
  const sendAt = new Date(Date.now() + 60_000);
  const pending = await scheduleMessage(admin, generalId, { body: "later", clientMessageId: randomUUID(), sendAt: sendAt.toISOString() });
  await cancelScheduled(admin, pending.id);
  await assert.rejects(() => cancelScheduled(admin, pending.id), status(400));
  const due = await scheduleMessage(admin, generalId, { body: "now please", clientMessageId: randomUUID(), sendAt: new Date(Date.now() - 1000).toISOString() });
  const result = await deliverDueScheduled(new Date());
  assert.ok(result.delivered >= 1);
  const row = await db.scheduledMessage.findUniqueOrThrow({ where: { id: due.id } });
  assert.equal(row.status, "SENT");
  assert.ok(row.sentMessageId);
});

test("reminders fire through the same scheduler tick", async () => {
  const reminder = await createReminder(asra, workspaceId, { text: "stand-up", dueAt: new Date(Date.now() - 1000).toISOString() });
  const result = await deliverDueReminders(new Date());
  assert.ok(result.fired >= 1);
  const row = await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
  assert.ok(row.firedAt);
});

test("incoming webhook posts into the chosen channel", async () => {
  const created = await createWebhook(admin, workspaceId, { name: "CI", channelId: generalId });
  const posted = await postWebhook(created.webhook.token, { text: "build green" });
  const message = await db.message.findUniqueOrThrow({ where: { id: posted.messageId } });
  assert.equal(message.body, "build green");
  assert.equal(message.viaApp, "CI");
});

test("workspace domain restriction blocks invites outside the list", async () => {
  await updateWorkspaceSettings(admin, workspaceId, { allowedEmailDomains: ["example.test"] });
  await assert.rejects(() => createInvites(admin, workspaceId, { emails: ["stranger@other.test"] }), status(403));
});

test("custom emoji shortcodes and unfurl SSRF helpers", async () => {
  assert.equal(isValidShortcode("ship-it"), true);
  assert.deepEqual(urlsToUnfurl("https://example.com/docs and https://docs.google.com/file/d/1"), ["https://example.com/docs"]);
  await assert.rejects(() => assertSafeUnfurlUrl("http://127.0.0.1/"));
});
