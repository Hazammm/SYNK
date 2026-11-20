import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// No real email: invites stop at the mailer check.
for (const name of ["MAILTRAP_HOST", "MAILTRAP_PORT", "MAILTRAP_USER", "MAILTRAP_PASS", "MAILTRAP_API_TOKEN", "MAIL_FROM"]) process.env[name] = "";
process.env.NEXTAUTH_SECRET ||= "test-secret-for-two-factor";
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { addChannelMember, createChannel, createDirectMessage, joinChannel, leaveChannel, listChannels, listMessages, sendMessage, toggleReaction, mentionedIn } = await import("../src/features/chat/service");
const { listNotifications, markNotificationsRead } = await import("../src/features/notifications/service");
const { listSaved, listThreads, markUnread, removeChannelMember, setChannelMuted, toggleSaved, updateChannelSettings } = await import("../src/features/chat/manage");
const { getAccount, pauseNotifications, setStatus, updateProfile, currentStatus } = await import("../src/features/account/service");
const { listPeople } = await import("../src/features/people/service");
const { readAvatar, removeAvatar, setAvatar } = await import("../src/features/account/avatar");
const { checkSecondFactor, confirmTwoFactor, disableTwoFactor, startTwoFactor } = await import("../src/features/account/two-factor");
const { totpCode } = await import("../src/lib/totp");
const { searchWorkspace } = await import("../src/features/search/service");
const { createInvites } = await import("../src/features/workspaces/invites");
const { exportWorkspace, getWorkspaceSettings, updateWorkspaceSettings, workspaceAnalytics } = await import("../src/features/workspaces/admin");
const { hash } = await import("bcryptjs");

// admin: workspace admin. asra and bilal: members. outsider: another workspace.
let admin: string, asra: string, bilal: string, outsider: string, workspaceId: string, otherWorkspaceId: string, generalId: string;
const users: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const post = (userId: string, channelId: string, body: string, extra: object = {}) => sendMessage(userId, channelId, { body, clientMessageId: randomUUID(), ...extra });
const alerts = async (userId: string) => (await listNotifications(userId)).notifications.filter(item => item.message);
const sessionId = async (userId: string) => (await db.loginSession.create({ data: { userId, expiresAt: new Date(Date.now() + 3_600_000) } })).id;

before(async () => {
  for (const name of ["Admin Person", "Asra Khan", "Bilal Ahmed", "Outsider"]) {
    users.push((await db.user.create({ data: { name, email: `synk-parity-${randomUUID()}@example.test` } })).id);
  }
  [admin, asra, bilal, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Parity workspace" })).id;
  otherWorkspaceId = (await createWorkspace(outsider, { name: "Elsewhere" })).id;
  for (const id of [asra, bilal]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  generalId = (await listChannels(admin, workspaceId)).find(channel => channel.isDefault)!.id;
  for (const id of [asra, bilal]) await joinChannel(id, generalId);
});

after(async () => {
  const keys = await db.user.findMany({ where: { id: { in: users }, avatarKey: { not: null } }, select: { avatarKey: true } });
  await Promise.all(keys.map(({ avatarKey }) => rm(join(process.cwd(), ".uploads", "avatars", avatarKey!), { force: true })));
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("mentions match full names with spaces, longest first, plus @channel and @here", () => {
  const people = [{ id: "a", name: "Asra Khan" }, { id: "b", name: "Asra" }, { id: "c", name: "Bilal Ahmed" }];
  const both = mentionedIn("Hi @Asra Khan and @bilal ahmed!", people);
  assert.deepEqual([both.userIds.sort(), both.channel, both.here], [["a", "c"], false, false]);
  assert.deepEqual(mentionedIn("@Asra please", people).userIds, ["b"]);
  assert.deepEqual(mentionedIn("email@Asra Khan.com is not a mention", people).userIds, []);
  assert.deepEqual(mentionedIn("@channel and @here", people), { userIds: [], channel: true, here: true });
});

test("chat alerts: mentions, direct messages, thread replies and reactions", async () => {
  const root = await post(asra, generalId, "Planning thread, @Bilal Ahmed what do you think?");
  assert.deepEqual((await alerts(bilal)).map(item => [item.type, item.actor?.name, item.message?.channelName]), [["CHAT_MENTION", "Asra Khan", "general"]]);
  assert.equal((await alerts(admin)).length, 0); // not mentioned

  await post(bilal, generalId, "I agree", { parentId: root.id });
  assert.deepEqual((await alerts(asra)).map(item => item.type), ["CHAT_REPLY"]); // the thread's author
  await post(admin, generalId, "Me too", { parentId: root.id });
  assert.deepEqual((await alerts(bilal)).map(item => item.type).sort(), ["CHAT_MENTION", "CHAT_REPLY"]); // an earlier replier

  await toggleReaction(bilal, root.id, { emoji: "👍" });
  assert.ok((await alerts(asra)).some(item => item.type === "CHAT_REACTION"));
  await toggleReaction(bilal, root.id, { emoji: "👍" }); // removing a reaction does not alert
  assert.equal((await alerts(asra)).filter(item => item.type === "CHAT_REACTION").length, 1);
  await toggleReaction(asra, root.id, { emoji: "🎉" }); // reacting to your own message does not alert you
  assert.equal((await alerts(asra)).filter(item => item.type === "CHAT_REACTION").length, 1);

  const dm = await createDirectMessage(asra, workspaceId, { userIds: [bilal] });
  await post(asra, dm.id, "Quick question");
  const direct = (await alerts(bilal)).find(item => item.message?.direct);
  assert.equal(direct?.type, "CHAT_MENTION");
  assert.equal(direct?.excerpt, "Quick question");
});

test("chat alerts respect muting, preferences and channel access", async () => {
  const room = await createChannel(asra, workspaceId, { name: "muted-room" });
  await joinChannel(bilal, room.id);
  await setChannelMuted(bilal, room.id, true);
  const root = await post(bilal, room.id, "Mine");
  await post(asra, room.id, "Reply", { parentId: root.id });
  await toggleReaction(asra, root.id, { emoji: "👀" });
  assert.equal((await alerts(bilal)).filter(item => item.message?.channelId === room.id).length, 0); // muted: no replies or reactions
  await post(asra, room.id, "But @Bilal Ahmed, look");
  assert.equal((await alerts(bilal)).filter(item => item.message?.channelId === room.id).length, 1); // direct mentions still come through

  await updateProfile(bilal, { notifications: { mentions: false } });
  await post(asra, room.id, "@Bilal Ahmed again");
  assert.equal((await alerts(bilal)).filter(item => item.message?.channelId === room.id).length, 1);
  await updateProfile(bilal, { notifications: { mentions: true } });

  await leaveChannel(bilal, room.id); // alerts from a channel you left are hidden
  assert.equal((await alerts(bilal)).filter(item => item.message?.channelId === room.id).length, 0);
  const { updated } = await markNotificationsRead(bilal, {});
  assert.ok(updated >= 1);
});

test("channel settings: rename, private, announcement-only and archive, by creators and admins only", async () => {
  const room = await createChannel(asra, workspaceId, { name: "launch" });
  await joinChannel(bilal, room.id);
  await assert.rejects(updateChannelSettings(bilal, room.id, { name: "mine" }), status(403));
  assert.equal((await updateChannelSettings(asra, room.id, { name: "Launch-Plan" })).name, "launch-plan");
  await assert.rejects(updateChannelSettings(asra, room.id, { name: "general" }), status(409));
  await assert.rejects(updateChannelSettings(admin, room.id, {}), { name: "ZodError" });

  await updateChannelSettings(admin, room.id, { postingPolicy: "ADMINS" });
  await assert.rejects(post(bilal, room.id, "Can I post?"), status(403));
  const announcement = await post(asra, room.id, "Launch is Friday"); // the creator can
  await post(bilal, room.id, "Great", { parentId: announcement.id }); // anyone can reply in a thread
  assert.equal((await listChannels(bilal, workspaceId)).find(item => item.id === room.id)?.canPost, false);

  assert.equal((await updateChannelSettings(asra, room.id, { private: true })).type, "PRIVATE");
  await assert.rejects(updateChannelSettings(asra, room.id, { private: true }), status(400));
  assert.ok(!(await listChannels(admin, workspaceId)).some(item => item.id === room.id)); // admin is not in it

  await updateChannelSettings(asra, room.id, { archived: true });
  await assert.rejects(post(asra, room.id, "Still there?"), status(400));
  assert.equal((await listChannels(bilal, workspaceId)).find(item => item.id === room.id)?.archived, true);
  await updateChannelSettings(asra, room.id, { archived: false });
  await post(asra, room.id, "Back again");

  await assert.rejects(updateChannelSettings(admin, generalId, { archived: true }), status(400));
  await assert.rejects(updateChannelSettings(admin, generalId, { private: true }), status(400));
  const dm = await createDirectMessage(asra, workspaceId, { userIds: [bilal] });
  await assert.rejects(updateChannelSettings(asra, dm.id, { name: "secret" }), status(404));
});

test("removing channel members", async () => {
  const room = await createChannel(asra, workspaceId, { name: "removals", isPrivate: true });
  await addChannelMember(asra, room.id, bilal);
  await assert.rejects(removeChannelMember(bilal, room.id, asra), status(403));
  await assert.rejects(removeChannelMember(asra, room.id, asra), status(400));
  assert.deepEqual(await removeChannelMember(asra, room.id, bilal), { removed: true });
  await assert.rejects(listMessages(bilal, room.id, {}), status(403));
  await assert.rejects(removeChannelMember(asra, room.id, bilal), status(404));
  await assert.rejects(removeChannelMember(admin, generalId, bilal), status(400));
});

test("mark as unread, save for later, threads inbox and also-send-to-channel", async () => {
  const room = await createChannel(asra, workspaceId, { name: "reading" });
  await joinChannel(bilal, room.id);
  const first = await post(asra, room.id, "First");
  await post(asra, room.id, "Second");
  await post(bilal, room.id, "Bilal read it all");
  assert.equal((await listChannels(bilal, workspaceId)).find(item => item.id === room.id)?.unreadCount, 0);
  await markUnread(bilal, first.id);
  assert.equal((await listChannels(bilal, workspaceId)).find(item => item.id === room.id)?.unreadCount, 3);
  await assert.rejects(markUnread(outsider, first.id), status(403));

  assert.deepEqual(await toggleSaved(bilal, first.id), { saved: true });
  assert.deepEqual((await listSaved(bilal, workspaceId)).map(item => [item.snippet, item.place]), [["First", "#reading"]]);
  assert.equal((await listMessages(bilal, room.id, {})).messages.find(item => item.id === first.id)?.saved, true);
  assert.equal((await listMessages(asra, room.id, {})).messages.find(item => item.id === first.id)?.saved, false); // saved is per person
  assert.deepEqual(await toggleSaved(bilal, first.id), { saved: false });
  assert.deepEqual(await listSaved(bilal, workspaceId), []);
  await assert.rejects(toggleSaved(outsider, first.id), status(403));

  const reply = await post(bilal, room.id, "Shared to the channel too", { parentId: first.id, alsoInChannel: true });
  await post(asra, room.id, "Only in the thread", { parentId: first.id });
  const feed = (await listMessages(asra, room.id, {})).messages.map(item => item.body);
  assert.ok(feed.includes("Shared to the channel too"));
  assert.ok(!feed.includes("Only in the thread"));
  assert.equal(reply.alsoInChannel, true);
  const threads = await listThreads(bilal, workspaceId);
  assert.equal(threads[0].rootId, first.id);
  assert.deepEqual([threads[0].replyCount, threads[0].lastReply.snippet], [2, "Only in the thread"]);
  assert.ok(!(await listThreads(admin, workspaceId)).some(item => item.rootId === first.id)); // admin is not in the thread
});

test("profile fields, custom status with expiry, away and paused notifications", async () => {
  await updateProfile(asra, { title: "Frontend developer", phone: "+92 300 1234567", location: "Lahore", timezone: "Asia/Karachi", pronouns: "she/her" });
  await assert.rejects(updateProfile(asra, { timezone: "Mars/Olympus" }), { name: "ZodError" });
  await assert.rejects(updateProfile(asra, { phone: "call me" }), { name: "ZodError" });
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  assert.deepEqual(await setStatus(asra, { text: "In a meeting", emoji: "📅", expiresAt: soon }), { text: "In a meeting", emoji: "📅", expiresAt: soon, away: false });
  await assert.rejects(setStatus(asra, { text: "Past", expiresAt: new Date(Date.now() - 1000).toISOString() }), status(400));
  assert.deepEqual(currentStatus({ statusText: "Gone", statusEmoji: "🌴", statusExpiresAt: new Date(Date.now() - 1000), away: false }), { text: "", emoji: "", expiresAt: null, away: false });
  await setStatus(asra, { text: "In a meeting", emoji: "📅", expiresAt: soon, away: true });

  await pauseNotifications(asra, { until: soon });
  await assert.rejects(pauseNotifications(asra, { until: new Date(Date.now() + 9 * 24 * 3_600_000).toISOString() }), status(400));
  const account = await getAccount(asra, await sessionId(asra));
  assert.deepEqual(account.profile, { title: "Frontend developer", phone: "+92 300 1234567", location: "Lahore", timezone: "Asia/Karachi", pronouns: "she/her", image: null });
  assert.equal(account.notificationsPausedUntil, soon);
  assert.equal(account.status.away, true);
  await pauseNotifications(asra, { until: null });
  assert.equal((await getAccount(asra, await sessionId(asra))).notificationsPausedUntil, null);

  const people = await listPeople(bilal, workspaceId);
  const listed = people.find(person => person.id === asra)!;
  assert.deepEqual([listed.title, listed.location, listed.status.text, listed.online], ["Frontend developer", "Lahore", "In a meeting", false]);
  assert.equal(people.length, 3);
  await assert.rejects(listPeople(outsider, workspaceId), status(403));
});

test("profile photos: images only, visible to people who share a workspace", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082", "hex");
  await assert.rejects(setAvatar(asra, new File(["<svg onload=alert(1)>"], "evil.png", { type: "image/png" })), status(400));
  const { image } = await setAvatar(asra, new File([png], "me.png", { type: "image/png" }));
  assert.match(image!, new RegExp(`^/api/users/${asra}/avatar\\?v=`));
  assert.equal((await readAvatar(bilal, asra)).type, "image/png");
  await assert.rejects(readAvatar(outsider, asra), status(404));
  assert.deepEqual(await removeAvatar(asra), { image: null });
  await assert.rejects(readAvatar(bilal, asra), status(404));
});

test("two-factor sign-in: setup, codes, single-use recovery codes and turning it off", async () => {
  await assert.rejects(startTwoFactor(bilal), status(400)); // no Synk password
  await db.user.update({ where: { id: bilal }, data: { passwordHash: await hash("correct horse battery", 4) } });
  const { secret, otpauthUrl } = await startTwoFactor(bilal);
  assert.match(otpauthUrl, /^otpauth:\/\/totp\/Synk%3A.*issuer=Synk/);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: bilal } })).totpSecret, null); // not on until confirmed
  assert.equal(await checkSecondFactor(bilal, "anything"), true);

  const wrong = String((Number(totpCode(secret)) + 500_000) % 1_000_000).padStart(6, "0");
  await assert.rejects(confirmTwoFactor(bilal, { code: wrong }), status(400));
  const { recoveryCodes } = await confirmTwoFactor(bilal, { code: totpCode(secret) });
  assert.equal(recoveryCodes.length, 8);
  const stored = await db.user.findUniqueOrThrow({ where: { id: bilal } });
  assert.ok(stored.totpSecret && !stored.totpSecret.includes(secret), "the secret is stored encrypted");
  assert.ok(!stored.totpRecoveryHashes.includes(recoveryCodes[0]), "recovery codes are stored hashed");
  assert.equal((await getAccount(bilal, await sessionId(bilal))).twoFactorEnabled, true);

  assert.equal(await checkSecondFactor(bilal, totpCode(secret)), true);
  assert.equal(await checkSecondFactor(bilal, wrong), false);
  assert.equal(await checkSecondFactor(bilal, recoveryCodes[0].toUpperCase()), true);
  assert.equal(await checkSecondFactor(bilal, recoveryCodes[0]), false, "a recovery code works once");
  await assert.rejects(startTwoFactor(bilal), status(409));

  await assert.rejects(disableTwoFactor(bilal, { password: "wrong password", code: totpCode(secret) }), status(400));
  await assert.rejects(disableTwoFactor(bilal, { password: "correct horse battery", code: wrong }), status(400));
  await disableTwoFactor(bilal, { password: "correct horse battery", code: recoveryCodes[1] });
  assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: bilal }, select: { totpSecret: true, totpRecoveryHashes: true } }), { totpSecret: null, totpRecoveryHashes: [] });
});

test("search modifiers narrow messages by person, channel, date, links and files", async () => {
  const room = await createChannel(admin, workspaceId, { name: "search-room" });
  await joinChannel(asra, room.id);
  await post(asra, room.id, "zebra notes https://example.test/runbook");
  await post(admin, room.id, "zebra notes without a link");
  await post(asra, generalId, "zebra notes in general");
  const hidden = await createChannel(bilal, workspaceId, { name: "zebra-private", isPrivate: true });
  await post(bilal, hidden.id, "zebra secret");
  const find = async (query: string) => (await searchWorkspace(asra, workspaceId, { query })).map(item => item.snippet).sort();

  assert.equal((await find("zebra")).length, 3); // never the private channel asra is not in
  assert.deepEqual(await find("zebra from:@asra"), ["zebra notes https://example.test/runbook", "zebra notes in general"]);
  assert.deepEqual(await find("zebra in:#search-room has:link"), ["zebra notes https://example.test/runbook"]);
  assert.deepEqual(await find("from:\"Admin Person\" in:search-room"), ["zebra notes without a link"]);
  assert.deepEqual(await find("zebra before:2000-01-01"), []);
  assert.equal((await find("zebra after:2000-01-01")).length, 3);
  assert.deepEqual(await find("zebra has:file"), []);
  assert.deepEqual(await find("zebra in:#zebra-private"), []);
  assert.ok((await searchWorkspace(asra, workspaceId, { query: "zebra from:@asra" })).every(item => item.type === "message"));
});

test("workspace admin: rename, invite policy, usage and export", async () => {
  // Members cannot invite until an admin allows it; then the request reaches the mailer.
  await assert.rejects(createInvites(asra, workspaceId, { emails: ["friend@example.test"] }), status(403));
  await assert.rejects(updateWorkspaceSettings(asra, workspaceId, { invitePolicy: "EVERYONE" }), status(403));
  assert.deepEqual(await updateWorkspaceSettings(admin, workspaceId, { name: "Parity HQ", invitePolicy: "EVERYONE" }), { id: workspaceId, name: "Parity HQ", invitePolicy: "EVERYONE" });
  assert.equal((await getWorkspaceSettings(asra, workspaceId)).invitePolicy, "EVERYONE");
  await assert.rejects(createInvites(asra, workspaceId, { emails: ["friend@example.test"] }), (error: unknown) => (error as { status?: number }).status !== 403);
  await assert.rejects(getWorkspaceSettings(outsider, workspaceId), status(403));
  await updateWorkspaceSettings(admin, workspaceId, { invitePolicy: "ADMINS" });

  await assert.rejects(workspaceAnalytics(asra, workspaceId), status(403));
  const usage = await workspaceAnalytics(admin, workspaceId);
  assert.equal(usage.members, 3);
  assert.ok(usage.messages.week > 0 && usage.messages.month >= usage.messages.week);
  assert.ok(usage.activeMembers.week >= 2);
  assert.equal(usage.daily.length, 14);
  assert.equal(usage.daily.reduce((sum, day) => sum + day.messages, 0), usage.messages.week + (usage.messages.month - usage.messages.week));

  await assert.rejects(exportWorkspace(bilal, workspaceId), status(403));
  const data = await exportWorkspace(admin, workspaceId);
  assert.equal(data.workspace.name, "Parity HQ");
  assert.equal(data.members.length, 3);
  assert.ok(data.messages.some(message => message.text === "zebra notes without a link"));
  assert.ok(!data.messages.some(message => message.text === "zebra secret"), "private channels are not exported");
  assert.ok(!data.channels.some(channel => channel.name === "zebra-private"));
});
