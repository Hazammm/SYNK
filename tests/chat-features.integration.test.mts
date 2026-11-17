import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const {
  addChannelMember, createChannel, createDirectMessage, deleteMessage, editMessage, getChannel, joinChannel, leaveChannel, listChannels, listMessages,
  listPins, markChannelRead, sendMessage, togglePin, toggleReaction, updateChannelTopic,
} = await import("../src/features/chat/service");
const { readAttachment, saveAttachment } = await import("../src/lib/attachments");

// admin: workspace admin. member and third: ordinary members.
let admin: string, member: string, third: string, workspaceId: string, generalId: string;
const users: string[] = [];
const uploads: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const post = (userId: string, channelId: string, body: string) => sendMessage(userId, channelId, { body, clientMessageId: randomUUID() });

before(async () => {
  for (const name of ["Admin", "Member", "Third"]) {
    users.push((await db.user.create({ data: { name, email: `synk-chatx-${randomUUID()}@example.test` } })).id);
  }
  [admin, member, third] = users;
  workspaceId = (await createWorkspace(admin, { name: "Chat features" })).id;
  for (const id of [member, third]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  generalId = (await listChannels(admin, workspaceId)).find(channel => channel.name === "general")!.id;
  for (const id of [member, third]) await joinChannel(id, generalId);
});

after(async () => {
  const keys = await db.attachment.findMany({ where: { id: { in: uploads } }, select: { storageKey: true } });
  await Promise.all(keys.map(({ storageKey }) => rm(join(process.cwd(), ".uploads", storageKey), { force: true })));
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("direct messages: one per pair, and hidden from everyone else", async () => {
  const dm = await createDirectMessage(member, workspaceId, { userIds: [third] });
  assert.deepEqual([dm.type, dm.memberCount, dm.otherUser?.name], ["DM", 2, "Third"]);
  assert.equal((await createDirectMessage(third, workspaceId, { userIds: [member] })).id, dm.id); // reused, not duplicated
  await post(member, dm.id, "Just between us");
  assert.equal((await getChannel(third, dm.id)).otherUser?.name, "Member");
  await assert.rejects(getChannel(admin, dm.id), status(404)); // even a workspace admin
  await assert.rejects(listMessages(admin, dm.id, {}), status(403));

  const group = await createDirectMessage(admin, workspaceId, { userIds: [member, third] });
  assert.deepEqual([group.type, group.memberCount], ["GROUP_DM", 3]);
});

test("editing: only the author, and only while they can still read the channel", async () => {
  const plans = await createChannel(admin, workspaceId, { name: "plans", isPrivate: true });
  await addChannelMember(admin, plans.id, member);
  const message = await post(member, plans.id, "First draft");
  await assert.rejects(editMessage(admin, message.id, { body: "Hijacked" }), status(403));
  const edited = await editMessage(member, message.id, { body: "Second draft" });
  assert.ok(edited.editedAt);
  assert.equal((await listMessages(admin, plans.id, {})).messages.find(item => item.id === message.id)?.body, "Second draft");

  await leaveChannel(member, plans.id);
  await assert.rejects(editMessage(member, message.id, { body: "Edited after leaving" }), status(403));
  await assert.rejects(editMessage(member, "missing-message", { body: "x" }), status(404));
});

test("deleting: authors and admins in the channel; nobody outside it", async () => {
  const mine = await post(member, generalId, "Delete me");
  await assert.rejects(deleteMessage(third, mine.id), status(403)); // another member
  assert.deepEqual(await deleteMessage(member, mine.id), { id: mine.id, channelId: generalId });
  const theirs = await post(third, generalId, "Admins can remove this");
  await deleteMessage(admin, theirs.id);
  const deleted = (await listMessages(admin, generalId, {})).messages.filter(item => [mine.id, theirs.id].includes(item.id));
  assert.ok(deleted.every(item => item.deletedAt));

  // An admin cannot delete messages in a direct message they are not part of.
  const dm = await createDirectMessage(member, workspaceId, { userIds: [third] });
  const secret = await post(member, dm.id, "Private");
  await assert.rejects(deleteMessage(admin, secret.id), status(403));
});

test("a deleted message's attachment is visible only to its uploader again", async () => {
  const file = await saveAttachment(member, workspaceId, new File(["notes"], "notes.txt", { type: "text/plain" }));
  uploads.push(file.id);
  const message = await sendMessage(member, generalId, { body: "Notes attached", clientMessageId: randomUUID(), attachmentIds: [file.id] });
  assert.equal((await readAttachment(third, file.id)).attachment.id, file.id);
  await deleteMessage(member, message.id);
  await assert.rejects(readAttachment(third, file.id), status(404));
  assert.equal((await readAttachment(member, file.id)).attachment.id, file.id);
});

test("reactions toggle per person and emoji, for channel members only", async () => {
  const message = await post(admin, generalId, "React to this");
  const first = await toggleReaction(member, message.id, { emoji: "👍" });
  await toggleReaction(third, message.id, { emoji: "👍" });
  const both = await toggleReaction(third, message.id, { emoji: "🎉" });
  assert.ok(first.reactions.length >= 1);
  assert.deepEqual(both.reactions.map(item => [item.emoji, item.count]).sort(), [["🎉", 1], ["👍", 2]]);
  const removed = await toggleReaction(member, message.id, { emoji: "👍" });
  assert.deepEqual(removed.reactions.map(item => [item.emoji, item.count]).sort(), [["🎉", 1], ["👍", 1]]);

  const dm = await createDirectMessage(member, workspaceId, { userIds: [third] });
  const secret = await post(member, dm.id, "No reactions from outside");
  await assert.rejects(toggleReaction(admin, secret.id, { emoji: "👀" }), status(403));
  await assert.rejects(toggleReaction(member, message.id, { emoji: "" }));
});

test("pins toggle and list, for channel members only", async () => {
  const message = await post(admin, generalId, "Pin me");
  assert.equal((await togglePin(member, message.id)).pinned, true);
  assert.ok((await listPins(third, generalId)).some(item => item.id === message.id));
  assert.equal((await togglePin(member, message.id)).pinned, false);
  assert.ok(!(await listPins(third, generalId)).some(item => item.id === message.id));
  const dm = await createDirectMessage(member, workspaceId, { userIds: [third] });
  await assert.rejects(listPins(admin, dm.id), status(403));
});

test("channels: topics, reading and leaving", async () => {
  assert.equal((await updateChannelTopic(member, generalId, "  Weekly updates  ")).topic, "Weekly updates");
  const { lastReadAt } = await markChannelRead(member, generalId);
  const row = await db.channelMember.findUniqueOrThrow({ where: { channelId_userId: { channelId: generalId, userId: member } } });
  assert.equal(row.lastReadAt?.toISOString(), lastReadAt);
  await assert.rejects(leaveChannel(member, generalId), status(400)); // the default channel
  const random = await createChannel(member, workspaceId, { name: "random" });
  assert.deepEqual(await leaveChannel(member, random.id), { left: true });
  await assert.rejects(leaveChannel(member, "missing-channel"), status(404));
});
