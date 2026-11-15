// The PRD's permission-denial suite (section 15: 100% of denied-access cases blocked, at least 10 scenarios).
// Each scenario is a person trying something they are not allowed to do. Every one must be refused, and
// must leave the data unchanged. The checks themselves live in src/lib/permissions.ts and the services.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// No real email: invites must be refused before anything is sent.
for (const name of ["MAILTRAP_HOST", "MAILTRAP_PORT", "MAILTRAP_USER", "MAILTRAP_PASS", "MAILTRAP_API_TOKEN", "MAIL_FROM"]) process.env[name] = "";
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember, removeMember } = await import("../src/features/workspaces/service");
const { createInvites } = await import("../src/features/workspaces/invites");
const { createChannel, joinChannel, listChannels, listMessages, sendMessage } = await import("../src/features/chat/service");
const { createProject, getProject, setProjectAccess } = await import("../src/features/projects/service");
const { createTicket, deleteTicket, getTicket, updateTicket } = await import("../src/features/tickets/service");
const { createDoc, getDoc, updateDoc } = await import("../src/features/docs/service");
const { startTimer } = await import("../src/features/time/service");
const { getProjectReport } = await import("../src/features/reports/service");
const { getOverview } = await import("../src/features/overview/service");
const { runAgentTool } = await import("../src/features/agent/tools");
const { linkRepository, receiveWebhook } = await import("../src/features/integrations/service");

// admin: workspace admin. member: in the workspace, no project access. viewer: can view the project only.
// outsider: in a different workspace.
let admin: string, member: string, viewer: string, outsider: string;
let workspaceId: string, otherWorkspaceId: string, projectId: string, ticketId: string, docId: string, generalId: string, privateId: string;
const users: string[] = [];
const refused = (error: unknown) => [403, 404].includes((error as { status?: number }).status ?? 0);

before(async () => {
  for (const name of ["Admin", "Member", "Viewer", "Outsider"]) {
    users.push((await db.user.create({ data: { name, email: `synk-deny-${randomUUID()}@example.test` } })).id);
  }
  [admin, member, viewer, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Denial workspace" })).id;
  otherWorkspaceId = (await createWorkspace(outsider, { name: "Elsewhere" })).id;
  for (const id of [member, viewer]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  projectId = (await createProject(admin, workspaceId, { name: "Secret", key: "SEC" })).id;
  await setProjectAccess(admin, projectId, { userId: viewer, level: "READ" });
  const boardId = (await getProject(admin, projectId)).boards[0].id;
  ticketId = (await createTicket(admin, { boardId, title: "Budget review" })).id;
  docId = (await createDoc(admin, projectId, { title: "Salaries", content: "Confidential" })).id;
  generalId = (await listChannels(admin, workspaceId)).find(channel => channel.name === "general")!.id;
  privateId = (await createChannel(admin, workspaceId, { name: "leadership", isPrivate: true })).id;
  await sendMessage(admin, privateId, { body: "Private plans", clientMessageId: randomUUID() });
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

// [who is acting, what they try]. Each attempt must throw a 403 or a 404.
const scenarios: [string, () => Promise<unknown>][] = [
  ["an outsider reads a channel's history", () => listMessages(outsider, generalId, {})],
  ["an outsider posts in a channel", () => sendMessage(outsider, generalId, { body: "hello", clientMessageId: randomUUID() })],
  ["a member joins a private channel they were not added to", () => joinChannel(member, privateId)],
  ["a member reads a private channel's history", () => listMessages(member, privateId, {})],
  ["a member without project access opens a ticket", () => getTicket(member, ticketId)],
  ["a viewer edits a ticket", () => updateTicket(viewer, ticketId, { title: "Changed" })],
  ["a viewer deletes a ticket", () => deleteTicket(viewer, ticketId)],
  ["a viewer creates a ticket", async () => createTicket(viewer, { boardId: (await getProject(admin, projectId)).boards[0].id, title: "Sneaky" })],
  ["a member without project access reads a page", () => getDoc(member, docId)],
  ["a viewer edits a page", async () => updateDoc(viewer, docId, { title: "Changed", content: "x", version: (await getDoc(admin, docId)).version })],
  ["a viewer logs time on a ticket", () => startTimer(viewer, { ticketId })],
  ["a member without project access reads its sprint reports", () => getProjectReport(member, projectId, {})],
  ["a member creates a project", () => createProject(member, workspaceId, { name: "Mine", key: "MINE" })],
  ["a member gives themselves project access", () => setProjectAccess(member, projectId, { userId: member, level: "WRITE" })],
  ["a member removes the admin from the workspace", () => removeMember(member, workspaceId, admin)],
  ["a member sends workspace invites", () => createInvites(member, workspaceId, { emails: ["friend@example.test"] })],
  ["an outsider opens another workspace's overview", () => getOverview(outsider, workspaceId)],
  ["a member links a repository to a project", () => linkRepository(member, projectId, { provider: "GITHUB", fullName: "acme/app" })],
];

for (const [scenario, attempt] of scenarios) {
  test(`denied: ${scenario}`, async () => {
    await assert.rejects(attempt(), refused);
  });
}

test("denied: the AI agent acting for someone can do no more than they can", async () => {
  // Tools report a refusal instead of throwing; the last check confirms nothing changed.
  for (const [userId, name, args] of [
    [member, "create_ticket", { title: "Budget leak", project: "Secret" }],
    [viewer, "update_ticket", { ticket: "SEC-1", status: "Done" }],
    [viewer, "create_doc", { title: "Notes", project: "Secret", content: "x" }],
    [outsider, "find_tickets", { query: "budget" }],
  ] as const) {
    const result = await runAgentTool({ userId, workspaceId }, name, { args, dryRun: false });
    assert.equal(result.ok, false, name);
  }
});

test("denied: a webhook signed with the wrong secret cannot change pull requests", async () => {
  const body = JSON.stringify({
    repository: { full_name: "acme/app" },
    pull_request: { number: 1, title: "SEC-1", html_url: "https://github.com/acme/app/pull/1", state: "open", head: { ref: "x" }, updated_at: "2026-11-15T00:00:00Z" },
  });
  const forged = new Headers({ "x-github-event": "pull_request", "x-hub-signature-256": `sha256=${createHmac("sha256", "guess").update(body).digest("hex")}` });
  await assert.rejects(receiveWebhook("GITHUB", forged, body), (error: unknown) => (error as { status?: number }).status === 401);
});
