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

