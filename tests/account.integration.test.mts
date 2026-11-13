import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createProject, getProject, setProjectAccess } = await import("../src/features/projects/service");
const { addComment, createTicket, getTicket, updateTicket } = await import("../src/features/tickets/service");
const { listNotifications } = await import("../src/features/notifications/service");
const { changePassword, getAccount, leaveWorkspace, signOutOtherSessions, updateProfile } = await import("../src/features/account/service");
const { createPasswordLogin } = await import("../src/lib/auth");
const { deleteConversations, listConversations, sendAgentTurn } = await import("../src/features/agent/service");

const PASSWORD = "Old-password-123!";
let owner: string, member: string, oauth: string, outsider: string;
let workspaceId: string, projectId: string, boardId: string;
const users: string[] = [];
const workspaces: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
const login = async (userId: string) => (await db.loginSession.create({ data: { userId, expiresAt: new Date(Date.now() + 86_400_000) } })).id;
const alertTypes = async (userId: string) => (await listNotifications(userId)).notifications.map(item => item.type).sort();

before(async () => {
  const passwordHash = await hash(PASSWORD, 12);
  for (const [name, withPassword] of [["Owner Person", true], ["Member Person", true], ["OAuth Person", false], ["Outsider Person", true]] as const) {
    users.push((await db.user.create({ data: { name, email: `synk-account-${randomUUID()}@example.test`, ...(withPassword && { passwordHash }) } })).id);
  }
  [owner, member, oauth, outsider] = users;
  await db.account.create({ data: { userId: oauth, type: "oauth", provider: "google", providerAccountId: randomUUID() } });
  workspaceId = (await createWorkspace(owner, { name: "Account workspace" })).id;
  workspaces.push(workspaceId, (await createWorkspace(outsider, { name: "Elsewhere" })).id);
  await addMember(owner, workspaceId, (await db.user.findUniqueOrThrow({ where: { id: member } })).email);
  projectId = (await createProject(owner, workspaceId, { name: "Account project", key: "ACC" })).id;
  await setProjectAccess(owner, projectId, { userId: member, level: "WRITE" });
  boardId = (await getProject(owner, projectId)).boards[0].id;
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("account: shows the person's details, workspaces and other sessions", async () => {
  const current = await login(owner);
  await login(owner);
  await db.loginSession.create({ data: { userId: owner, expiresAt: new Date(Date.now() - 1000) } }); // expired, not counted
  const account = await getAccount(owner, current);
  assert.deepEqual([account.name, account.hasPassword, account.providers, account.otherSessions], ["Owner Person", true, [], 1]);
  assert.deepEqual(account.notifications, { assigned: true, comments: true, mentions: true });
  assert.deepEqual(account.workspaces.map(item => [item.name, item.role, item.memberCount, item.adminCount]), [["Account workspace", "ADMIN", 2, 1]]);
  const google = await getAccount(oauth, await login(oauth));
  assert.deepEqual([google.hasPassword, google.providers, google.workspaces], [false, ["Google"], []]);
});

test("profile: the name can be changed, and bad updates are refused", async () => {
  await updateProfile(member, { name: "  Member Renamed  " });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: member } })).name, "Member Renamed");
  await assert.rejects(updateProfile(member, { name: "   " }));
  await assert.rejects(updateProfile(member, { name: "x".repeat(81) }));
  await assert.rejects(updateProfile(member, {})); // nothing to update
  await assert.rejects(updateProfile(member, { notifications: {} }));
  await assert.rejects(updateProfile(member, { email: "new@example.test" })); // email cannot be changed here
  await assert.rejects(updateProfile(member, { notifications: { assigned: "no" } }));
});

test("notifications: turned-off kinds are not created, and turning them back on restores them", async () => {
  await updateProfile(member, { notifications: { assigned: false, mentions: false } });
  const ticket = await createTicket(owner, { boardId, title: "Quiet ticket", assigneeId: member });
  await addComment(owner, ticket.id, { body: "Hello @Member Renamed", mentionIds: [member] });
  assert.deepEqual(await alertTypes(member), []); // the mention would have replaced the comment alert, and both are off

  await addComment(owner, ticket.id, { body: "A plain comment" });
  assert.deepEqual(await alertTypes(member), ["TICKET_COMMENT"]); // comments are still on

  await updateProfile(member, { notifications: { assigned: true, comments: false } });
  const other = await createTicket(owner, { boardId, title: "Loud ticket" });
  await updateTicket(owner, other.id, { assigneeId: member });
  await addComment(owner, other.id, { body: "Another plain comment" });
  assert.deepEqual(await alertTypes(member), ["TICKET_ASSIGNED", "TICKET_COMMENT"]); // the new comment was not alerted
  assert.deepEqual((await getAccount(member, await login(member))).notifications, { assigned: true, comments: false, mentions: false });
  await updateProfile(member, { notifications: { assigned: true, comments: true, mentions: true } });
});

test("password: needs the current password, signs out other sessions and keeps this one", async () => {
  const here = await login(owner), elsewhere = await login(owner);
  await db.passwordResetToken.create({ data: { userId: owner, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
  await rejects(changePassword(owner, here, { currentPassword: "wrong-password-1", newPassword: "New-password-456!" }), 400);
  await rejects(changePassword(owner, here, { currentPassword: PASSWORD, newPassword: PASSWORD }), 400); // must differ
  await assert.rejects(changePassword(owner, here, { currentPassword: PASSWORD, newPassword: "short" }));

  assert.ok((await changePassword(owner, here, { currentPassword: PASSWORD, newPassword: "New-password-456!" })).signedOut >= 1);
  const stored = (await db.user.findUniqueOrThrow({ where: { id: owner } })).passwordHash!;
  assert.equal(await compare("New-password-456!", stored), true);
  assert.equal(await db.loginSession.count({ where: { id: here } }), 1);
  assert.equal(await db.loginSession.count({ where: { id: elsewhere } }), 0);
  assert.equal(await db.passwordResetToken.count({ where: { userId: owner } }), 0);
  // A login that checked the old password before the change is refused.
  const oldHash = await hash(PASSWORD, 4);
  assert.equal(await createPasswordLogin(owner, oldHash), null);
  await rejects(changePassword(oauth, await login(oauth), { currentPassword: "anything-at-all", newPassword: "New-password-456!" }), 400);
});

test("sessions: signing out elsewhere ends only the other sessions of that person", async () => {
  const here = await login(member), a = await login(member), b = await login(member), someoneElse = await login(owner);
  const before = await db.loginSession.count({ where: { userId: member } });
  assert.equal((await signOutOtherSessions(member, here)).signedOut, before - 1);
  assert.deepEqual(await db.loginSession.findMany({ where: { userId: member }, select: { id: true } }), [{ id: here }]);
  assert.equal(await db.loginSession.count({ where: { id: { in: [a, b] } } }), 0);
  assert.equal(await db.loginSession.count({ where: { id: someoneElse } }), 1);
  assert.equal((await signOutOtherSessions(member, here)).signedOut, 0);
});

test("workspaces: members can leave, losing access and assignments; the only admin cannot", async () => {
  const assigned = await createTicket(owner, { boardId, title: "Assigned before leaving", assigneeId: member });
  await rejects(leaveWorkspace(owner, workspaceId), 400); // the only admin
  await rejects(leaveWorkspace(outsider, workspaceId), 403);
  await assert.rejects(leaveWorkspace(member, "not an id"));

  assert.deepEqual(await leaveWorkspace(member, workspaceId), { left: true });
  assert.equal(await db.membership.count({ where: { workspaceId, userId: member } }), 0);
  assert.equal(await db.channelMember.count({ where: { workspaceId, userId: member } }), 0);
  assert.equal(await db.projectAccess.count({ where: { projectId, userId: member } }), 0);
  assert.equal((await getTicket(owner, assigned.id)).assignee, null);
  await rejects(leaveWorkspace(member, workspaceId), 403); // already gone

  // With a second admin, an admin may leave; two admins leaving at once leave one behind.
  const email = (id: string) => db.user.findUniqueOrThrow({ where: { id } }).then(user => user.email);
  await addMember(owner, workspaceId, await email(member));
  await db.membership.update({ where: { workspaceId_userId: { workspaceId, userId: member } }, data: { role: "ADMIN" } });
  const results = await Promise.allSettled([leaveWorkspace(owner, workspaceId), leaveWorkspace(member, workspaceId)]);
  assert.deepEqual(results.map(result => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(await db.membership.count({ where: { workspaceId, role: "ADMIN" } }), 1);
  // Put the original admin back for any later test.
  const remaining = (await db.membership.findFirstOrThrow({ where: { workspaceId } })).userId;
  if (remaining !== owner) {
    await addMember(remaining, workspaceId, await email(owner));
    await db.membership.update({ where: { workspaceId_userId: { workspaceId, userId: owner } }, data: { role: "ADMIN" } });
  }
});

test("assistant: deleting conversations removes only the caller's, in one workspace or all", async () => {
  const reply = async () => ({ reply: "Hi.", actions: [], pending: null });
  const mine = await sendAgentTurn(owner, { workspaceId, message: "Hello" }, reply);
  const elsewhereWorkspace = (await createWorkspace(owner, { name: "Second account workspace" })).id;
  workspaces.push(elsewhereWorkspace);
  await sendAgentTurn(owner, { workspaceId: elsewhereWorkspace, message: "Hello there" }, reply);
  const theirs = await sendAgentTurn(outsider, { workspaceId: workspaces[1], message: "Mine, not yours" }, reply);

  const forgotten: string[][] = [];
  const forget = async (ids: string[]) => { forgotten.push(ids); return true; };
  assert.deepEqual(await deleteConversations(owner, workspaceId, forget), { deleted: 1, agentMemoryCleared: true });
  assert.deepEqual(forgotten, [[mine.conversation.id]]);
  assert.deepEqual(await listConversations(owner, workspaceId), []);
  assert.equal((await listConversations(owner, elsewhereWorkspace)).length, 1);

  // When the agent service is down, the transcripts are still deleted and the caller is told.
  assert.deepEqual(await deleteConversations(owner, null, async () => false), { deleted: 1, agentMemoryCleared: false });
  assert.equal(await db.conversation.count({ where: { userId: owner } }), 0);
  assert.equal(await db.conversation.count({ where: { id: theirs.conversation.id } }), 1); // someone else's is untouched
  await rejects(deleteConversations(owner, workspaces[1], forget), 403); // not a member there
});
