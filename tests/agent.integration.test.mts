import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import type { AgentReply, AgentRequest, AgentToolResult } from "../src/lib/agent-types";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NEXTAUTH_SECRET ??= "integration-only-not-a-production-secret-123456789";
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createProject, getProject, setProjectAccess } = await import("../src/features/projects/service");
const { createSprint, getTicket } = await import("../src/features/tickets/service");
const { runAgentTool } = await import("../src/features/agent/tools");
const { buildAgentContext } = await import("../src/features/agent/context");
const { getConversation, listConversations, sendAgentTurn } = await import("../src/features/agent/service");
const { createDoc } = await import("../src/features/docs/service");
const { createChannel, sendMessage } = await import("../src/features/chat/service");
const { mintAgentToken, verifyAgentToken } = await import("../src/lib/agent-token");
const { POST: toolRoute } = await import("../src/app/api/agent-tools/[name]/route");

// admin: workspace admin with WRITE. khan and ali: two Sarahs with WRITE. reader: READ.
// bystander: workspace member without project access. outsider: belongs to another workspace.
let admin: string, khan: string, ali: string, reader: string, bystander: string, outsider: string;
let workspaceId: string, projectId: string, boardId: string;
const users: string[] = [];
const workspaces: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
const run = (userId: string, name: string, args: object, dryRun = false) => runAgentTool({ userId, workspaceId }, name, { args, dryRun });
function failed(result: AgentToolResult, code: string) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, code, result.message);
  return result;
}
function succeeded(result: AgentToolResult) {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}: ${result.message}`);
  return result;
}

before(async () => {
  for (const name of ["Admin Person", "Sarah Khan", "Sarah Ali", "Reader Person", "Bystander Person", "Outsider Person"]) {
    users.push((await db.user.create({ data: { name, email: `synk-agent-${randomUUID()}@example.test` } })).id);
  }
  [admin, khan, ali, reader, bystander, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Agent workspace" })).id;
  workspaces.push(workspaceId, (await createWorkspace(outsider, { name: "Elsewhere" })).id);
  for (const id of [khan, ali, reader, bystander]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  projectId = (await createProject(admin, workspaceId, { name: "Agent Tracker", key: "AGT" })).id;
  for (const id of [khan, ali]) await setProjectAccess(admin, projectId, { userId: id, level: "WRITE" });
  await setProjectAccess(admin, projectId, { userId: reader, level: "READ" });
  boardId = (await getProject(admin, projectId)).boards[0].id;
  await createSprint(admin, projectId, { name: "Sprint 5", startDate: "2026-11-10", endDate: "2026-11-16" });
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("create_ticket: resolves names, creates as the caller and writes the action log", async () => {
  const preview = succeeded(await run(admin, "create_ticket", { title: "Dry run only", status: "review" }, true));
  assert.match(preview.summary, /Ready to create “Dry run only” in Review on Agent Tracker/);
  assert.equal(await db.ticket.count({ where: { projectId, title: "Dry run only" } }), 0);

  const result = succeeded(await run(admin, "create_ticket", {
    title: "Login bug", project: "agt", priority: "high", assignee: "Khan", status: "in progress", sprint: "sprint 5", due_date: "2026-11-30", description: null,
  }));
  assert.match(result.summary, /^Created AGT-1 “Login bug” in In Progress on Agent Tracker, assigned to Sarah Khan, in Sprint 5, due 2026-11-30\.$/);
  const ticket = await getTicket(admin, result.target!.id);
  assert.deepEqual([ticket.priority, ticket.assignee?.id, ticket.reporter?.id, ticket.dueDate, ticket.boardId], ["HIGH", khan, admin, "2026-11-30", boardId]);

  // "me" assigns to the caller, and the defaults are the first column and medium priority.
  const mine = succeeded(await run(khan, "create_ticket", { title: "My task", assignee: "me" }));
  const created = await getTicket(khan, mine.target!.id);
  assert.deepEqual([created.assignee?.id, created.priority], [khan, "MEDIUM"]);

  const logs = await db.actionLog.findMany({ where: { workspaceId, tool: "create_ticket" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(logs.map(log => [log.userId, log.dryRun, log.ok, log.target]), [[admin, true, true, null], [admin, false, true, "AGT-1"], [khan, false, true, "AGT-2"]]);
});

test("create_ticket: unclear names are reported with candidates instead of guessed", async () => {
  const sarah = failed(await run(admin, "create_ticket", { title: "Assign me", assignee: "Sarah" }), "ambiguous");
  assert.deepEqual(sarah.candidates?.sort(), ["Sarah Ali", "Sarah Khan"]);
  assert.deepEqual(failed(await run(admin, "create_ticket", { title: "x", status: "Shipped" }), "not_found").candidates, ["To Do", "In Progress", "Review", "Done"]);
  failed(await run(admin, "create_ticket", { title: "x", assignee: "Bystander" }), "not_found"); // not on the project
  failed(await run(admin, "create_ticket", { title: "x", priority: "urgent" }), "invalid");
  failed(await run(admin, "create_ticket", { title: "x", due_date: "next Friday" }), "invalid");
  failed(await run(admin, "create_ticket", { title: "x", surprise: true }), "invalid");
  assert.equal(await db.ticket.count({ where: { projectId, title: { in: ["Assign me", "x"] } } }), 0);

  // With a second project, leaving the project out is a question, and unknown projects look the same as hidden ones.
  const second = await createProject(admin, workspaceId, { name: "Second Tracker", key: "SEC" });
  assert.deepEqual(failed(await run(admin, "create_ticket", { title: "Where?" }), "ambiguous").candidates, ["Agent Tracker (AGT)", "Second Tracker (SEC)"]);
  failed(await run(admin, "create_ticket", { title: "Where?", project: "tracker" }), "ambiguous");
  const hidden = failed(await run(khan, "create_ticket", { title: "Hidden", project: "SEC" }), "not_found");
  const missing = failed(await run(khan, "create_ticket", { title: "Hidden", project: "NOPE" }), "not_found");
  assert.equal(hidden.message.replace("SEC", "NOPE"), missing.message);
  await db.project.delete({ where: { id: second.id } });
});

test("tools never give the agent more access than the person has", async () => {
  assert.match(failed(await run(reader, "create_ticket", { title: "Read only" }), "forbidden").message, /view-only access/);
  assert.match(failed(await run(bystander, "create_ticket", { title: "No project" }), "forbidden").message, /don't have access to any project/);
  failed(await run(outsider, "create_ticket", { title: "Other workspace" }), "forbidden");
  failed(await run(reader, "update_ticket", { ticket: "AGT-1", status: "Done" }), "forbidden");
  // A ticket the caller cannot open is indistinguishable from one that does not exist.
  const hidden = failed(await run(bystander, "update_ticket", { ticket: "AGT-1", status: "Done" }), "not_found");
  const missing = failed(await run(bystander, "update_ticket", { ticket: "AGT-999", status: "Done" }), "not_found");
  assert.equal(hidden.message.replace("AGT-1", "AGT-999"), missing.message);
  assert.equal(await db.ticket.count({ where: { projectId, title: { in: ["Read only", "No project", "Other workspace"] } } }), 0);
  assert.equal(await db.actionLog.count({ where: { userId: { in: [reader, bystander, outsider] }, ok: true } }), 0);
  assert.equal(await db.actionLog.count({ where: { userId: outsider, ok: false, tool: "create_ticket" } }), 1); // denials are logged too
  await rejects(run(admin, "delete_everything", {}), 404);
});

test("update_ticket: the dry run previews changes and only the real call applies them", async () => {
  const before = await db.ticket.findFirstOrThrow({ where: { projectId, key: "AGT-1" }, include: { column: true } });
  const args = { ticket: "agt-1", status: "done", priority: "low", assignee: "Sarah Ali", sprint: "none", due_date: "none", title: "Login bug" };
  const preview = succeeded(await run(admin, "update_ticket", args, true));
  assert.deepEqual(preview.preview?.changes, [
    { field: "Priority", from: "High", to: "Low" }, { field: "Status", from: "In Progress", to: "Done" },
    { field: "Assignee", from: "Sarah Khan", to: "Sarah Ali" }, { field: "Sprint", from: "Sprint 5", to: "Backlog" }, { field: "Due date", from: "2026-11-30", to: "None" },
  ]);
  assert.match(preview.summary, /^Update AGT-1 “Login bug”: priority High → Low; status In Progress → Done;/);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: before.id } })).updatedAt.getTime(), before.updatedAt.getTime()); // untouched

  const applied = succeeded(await run(admin, "update_ticket", args));
  assert.match(applied.summary, /^Updated AGT-1: /);
  const ticket = await getTicket(admin, before.id);
  assert.deepEqual([ticket.priority, ticket.assignee?.id, ticket.sprintId, ticket.dueDate, Boolean(ticket.completedAt)], ["LOW", ali, null, null, true]);

  // Repeating the same request changes nothing and says so; an unassign uses "none".
  const again = succeeded(await run(admin, "update_ticket", args, true));
  assert.equal(again.preview, undefined);
  assert.match(again.summary, /already has those values/);
  succeeded(await run(admin, "update_ticket", { ticket: "AGT-1", assignee: "none" }));
  assert.equal((await getTicket(admin, before.id)).assignee, null);

  failed(await run(admin, "update_ticket", { ticket: "AGT-1" }), "invalid"); // nothing to change
  failed(await run(admin, "update_ticket", { ticket: "the login one", status: "Done" }), "invalid"); // needs a key
  failed(await run(admin, "update_ticket", { ticket: "AGT-1", assignee: "Sarah" }), "ambiguous");
});

test("find_tickets: matches words in any order and only searches projects the caller can open", async () => {
  const titles = async (userId: string, args: object) => (succeeded(await run(userId, "find_tickets", args)).data as { tickets: { key: string; title: string }[] }).tickets.map(ticket => ticket.title).sort();
  assert.deepEqual(await titles(reader, { query: "bug login" }), ["Login bug"]);
  assert.deepEqual(await titles(reader, { query: "AGT-2" }), ["My task"]);
  assert.deepEqual(await titles(khan, { assignee: "me" }), ["My task"]);
  assert.deepEqual(await titles(admin, { assignee: "unassigned" }), ["Login bug"]);
  assert.deepEqual(await titles(admin, { status: "to do", project: "agt" }), ["My task"]);
  assert.deepEqual(await titles(admin, { query: "nothing matches this" }), []);
  assert.deepEqual(await titles(bystander, {}), []);
  failed(await run(outsider, "find_tickets", {}), "forbidden");
});

test("tool endpoint: only a valid, unexpired token signed by this server is accepted", async () => {
  const call = (token: string | null, name = "find_tickets", body: object = { args: { query: "login" } }) => toolRoute(
    new Request(`http://localhost:3000/api/agent-tools/${name}`, { method: "POST", headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ name }) },
  );
  const claims = { userId: reader, workspaceId, conversationId: "conversation-1" };
  const token = mintAgentToken(claims);
  const ok = await call(token);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json() as { data: { tickets: unknown[] } }).data.tickets.length, 1);
  assert.equal((await db.actionLog.findFirstOrThrow({ where: { userId: reader, conversationId: "conversation-1" } })).tool, "find_tickets");

  assert.equal((await call(null)).status, 401);
  assert.equal((await call("not-a-token")).status, 401);
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...claims, userId: admin, expiresAt: Date.now() + 60_000 })).toString("base64url");
  assert.equal((await call(`${forged}.${signature}`)).status, 401); // another user's claims with a real signature
  assert.equal((await call(`${payload}.${signature.slice(0, -2)}xx`)).status, 401);
  assert.equal((await call(mintAgentToken(claims, Date.now() - 6 * 60_000))).status, 401); // expired
  assert.equal((await call(token, "no_such_tool")).status, 404);
  // A denial is a normal 200 result, so the agent can explain it.
  const denied = await call(token, "create_ticket", { args: { title: "Nope" } });
  assert.equal(denied.status, 200);
  assert.equal((await denied.json() as { code: string }).code, "forbidden");
  assert.deepEqual(verifyAgentToken(token).userId, reader);
});

test("context: describes only what the caller can see", async () => {
  const context = await buildAgentContext(reader, workspaceId, new Date("2026-11-12T08:00:00.000Z"));
  assert.deepEqual([context.today, context.user.name, context.workspace.name, context.workspace.role], ["2026-11-12", "Reader Person", "Agent workspace", "member"]);
  assert.deepEqual(context.projects, [{
    key: "AGT", name: "Agent Tracker", access: "view", boards: [{ name: "Main board", statuses: ["To Do", "In Progress", "Review", "Done"] }],
    members: ["Admin Person", "Reader Person", "Sarah Ali", "Sarah Khan"], sprints: [{ name: "Sprint 5", state: "planned" }], pages: [],
  }]);
  assert.equal((await buildAgentContext(admin, workspaceId)).projects[0].access, "edit");
  assert.deepEqual((await buildAgentContext(bystander, workspaceId)).projects, []);
  await rejects(buildAgentContext(outsider, workspaceId), 403);
});

test("conversations: a turn stores both messages and hands the agent a token for that person only", async () => {
  const requests: AgentRequest[] = [];
  const agent = async (request: AgentRequest): Promise<AgentReply> => {
    requests.push(request);
    return { reply: "Created AGT-9.", actions: [{ tool: "create_ticket", ok: true, summary: "Created AGT-9 “Ship it”." }], pending: null };
  };
  const turn = await sendAgentTurn(khan, { workspaceId, message: "  Create a ticket called Ship it  " }, agent);
  assert.equal(turn.conversation.title, "Create a ticket called Ship it");
  assert.deepEqual(turn.messages.map(message => [message.role, message.body, message.actions.length, message.pending]), [["USER", "Create a ticket called Ship it", 0, null], ["ASSISTANT", "Created AGT-9.", 1, null]]);
  assert.equal(turn.resolved, null);
  const [request] = requests;
  assert.deepEqual([request.threadId, request.message, request.decision, request.context.user.name], [turn.conversation.id, "Create a ticket called Ship it", undefined, "Sarah Khan"]);
  assert.deepEqual(verifyAgentToken(request.userToken), { ...verifyAgentToken(request.userToken), userId: khan, workspaceId, conversationId: turn.conversation.id });

  await sendAgentTurn(khan, { conversationId: turn.conversation.id, message: "And another" }, agent);
  assert.equal((await getConversation(khan, turn.conversation.id)).messages.length, 4);
  assert.deepEqual((await listConversations(khan, workspaceId)).map(item => item.id), [turn.conversation.id]);

  // Conversations are private: other people, even workspace admins, cannot read or continue them.
  await rejects(getConversation(admin, turn.conversation.id), 404);
  await rejects(sendAgentTurn(admin, { conversationId: turn.conversation.id, message: "Let me in" }, agent), 404);
  assert.deepEqual(await listConversations(admin, workspaceId), []);
  await rejects(listConversations(outsider, workspaceId), 403);
  await rejects(sendAgentTurn(outsider, { workspaceId, message: "Hello" }, agent), 403);
  await assert.rejects(sendAgentTurn(khan, { workspaceId }, agent)); // neither a message nor a decision
  await assert.rejects(sendAgentTurn(khan, { workspaceId, decision: "approve" }, agent)); // a decision needs a conversation
});

test("conversations: a pending change blocks new messages until it is confirmed or cancelled once", async () => {
  const pending = { tool: "update_ticket", summary: "Update AGT-1 “Login bug”: status To Do → Done.", changes: [{ field: "Status", from: "To Do", to: "Done" }] };
  const seen: (string | undefined)[] = [];
  const agent = async (request: AgentRequest): Promise<AgentReply> => {
    seen.push(request.decision);
    return request.decision ? { reply: request.decision === "approve" ? "Done." : "Cancelled.", actions: [], pending: null } : { reply: "Please confirm.", actions: [], pending };
  };
  const first = await sendAgentTurn(ali, { workspaceId, message: "Move AGT-1 to done" }, agent);
  const waiting = first.messages[1];
  assert.deepEqual(waiting.pending, { ...pending, status: "PENDING" });
  await rejects(sendAgentTurn(ali, { conversationId: first.conversation.id, message: "Never mind, do something else" }, agent), 409);

  const answered = await sendAgentTurn(ali, { conversationId: first.conversation.id, decision: "approve" }, agent);
  assert.deepEqual(answered.resolved, { messageId: waiting.id, status: "APPROVED" });
  assert.deepEqual(answered.messages.map(message => message.body), ["Done."]);
  await rejects(sendAgentTurn(ali, { conversationId: first.conversation.id, decision: "approve" }, agent), 409); // already answered
  assert.deepEqual(seen, [undefined, "approve"]);
  const history = await getConversation(ali, first.conversation.id);
  assert.deepEqual(history.messages.map(message => message.pending?.status ?? null), [null, "APPROVED", null]);

  // Two clicks at the same moment resolve the change once.
  const second = await sendAgentTurn(ali, { conversationId: first.conversation.id, message: "Move it back" }, agent);
  const clicks = await Promise.allSettled([1, 2].map(() => sendAgentTurn(ali, { conversationId: second.conversation.id, decision: "reject" }, agent)));
  assert.deepEqual(clicks.map(click => click.status).sort(), ["fulfilled", "rejected"]);
});

test("conversations: when the agent fails, the unanswered question is removed and a decision stays pending", async () => {
  const down = async (): Promise<AgentReply> => { throw Object.assign(new Error("The AI assistant is not running."), { status: 503 }); };
  await rejects(sendAgentTurn(reader, { workspaceId, message: "Anyone there?" }, down), 503);
  assert.equal(await db.conversation.count({ where: { userId: reader } }), 0);

  const pending = { tool: "update_ticket", summary: "Update AGT-2.", changes: [] };
  const turn = await sendAgentTurn(reader, { workspaceId, message: "Change AGT-2" }, async () => ({ reply: "Please confirm.", actions: [], pending }));
  await rejects(sendAgentTurn(reader, { conversationId: turn.conversation.id, decision: "approve" }, down), 503);
  const history = await getConversation(reader, turn.conversation.id);
  assert.deepEqual(history.messages.map(message => message.pending?.status ?? null), [null, "PENDING"]); // still answerable
});

test("create_doc: writes a page as the caller, under a parent found by title", async () => {
  const brief = succeeded(await run(admin, "create_doc", { title: "Project brief", content: "# Goals" }));
  assert.match(brief.summary, /^Created the page “Project brief” in Agent Tracker\.$/);
  assert.equal(brief.target?.type, "doc");
  const retro = succeeded(await run(khan, "create_doc", { title: "Sprint 5 retro", content: "- [ ] follow up", parent: "project brief", project: "AGT" }));
  assert.match(retro.summary, /under “Project brief”/);
  const page = await db.doc.findUniqueOrThrow({ where: { id: retro.target!.id } });
  assert.deepEqual([page.parentId, page.createdById, page.content], [brief.target!.id, khan, "- [ ] follow up"]);
  assert.equal((await db.actionLog.findFirstOrThrow({ where: { tool: "create_doc", userId: khan } })).target, `doc:${page.id}`);

  succeeded(await run(admin, "create_doc", { title: "Project budget" }));
  assert.deepEqual(failed(await run(admin, "create_doc", { title: "x", parent: "project" }), "ambiguous").candidates?.sort(), ["Project brief", "Project budget"]);
  failed(await run(admin, "create_doc", { title: "x", parent: "Nonexistent" }), "not_found");
  assert.match(failed(await run(reader, "create_doc", { title: "Read only" }), "forbidden").message, /view-only/);
  failed(await run(bystander, "create_doc", { title: "No project" }), "forbidden");
  assert.equal(await db.doc.count({ where: { title: { in: ["x", "Read only", "No project"] } } }), 0);
  assert.deepEqual((await buildAgentContext(admin, workspaceId)).projects[0].pages.sort(), ["Project brief", "Project budget", "Sprint 5 retro"]);
});
