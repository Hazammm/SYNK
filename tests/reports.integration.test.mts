import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace } = await import("../src/features/workspaces/service");
const { createProject, getProject, setProjectAccess } = await import("../src/features/projects/service");
const { createSprint, createTicket, updateSprint } = await import("../src/features/tickets/service");
const { getProjectReport } = await import("../src/features/reports/service");
const { getOverview } = await import("../src/features/overview/service");

// admin: workspace admin with WRITE. reader: member with READ. bystander: workspace member without project access.
let admin: string, reader: string, bystander: string;
let workspaceId: string, projectId: string, boardId: string, sprintId: string;
let columns: { id: string; name: string }[];
const users: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
const finishedOn = (ticketId: string, day: string) => db.ticket.update({ where: { id: ticketId }, data: { completedAt: new Date(`${day}T10:00:00.000Z`) } });
const addTestMember = (userId: string, workspaceId: string) => db.membership.upsert({
  where: { workspaceId_userId: { workspaceId, userId } },
  create: { workspaceId, userId, role: "MEMBER" },
  update: {},
});

before(async () => {
  for (const name of ["Admin", "Reader", "Bystander"]) {
    users.push((await db.user.create({ data: { name, email: `synk-reports-${randomUUID()}@example.test` } })).id);
  }
  [admin, reader, bystander] = users;
  workspaceId = (await createWorkspace(admin, { name: "Reports workspace" })).id;
  for (const id of [reader, bystander]) await addTestMember(id, workspaceId);
  projectId = (await createProject(admin, workspaceId, { name: "Reported", key: "RPT" })).id;
  await setProjectAccess(admin, projectId, { userId: reader, level: "READ" });
  const board = (await getProject(admin, projectId)).boards[0];
  boardId = board.id; columns = board.columns;
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("reports: a project without sprints has nothing to report", async () => {
  assert.deepEqual(await getProjectReport(admin, projectId, {}), { sprints: [], report: null, velocity: [] });
});

test("reports: an active sprint shows totals, breakdowns and a burndown up to today", async () => {
  const done = columns[3].id;
  sprintId = (await createSprint(admin, projectId, { name: "Sprint 1", goal: "Ship reports", startDate: "2026-11-02", endDate: "2026-11-08" })).id;
  const make = (title: string, extra: object = {}) => createTicket(admin, { boardId, title, sprintId, ...extra });
  const [first, second] = [await make("First done", { columnId: done }), await make("Second done", { columnId: done, assigneeId: reader })];
  await make("Still open", { assigneeId: reader });
  await make("Unassigned and open");
  await createTicket(admin, { boardId, title: "Backlog, not in the sprint" });
  await finishedOn(first.id, "2026-11-03");
  await finishedOn(second.id, "2026-11-05");
  await updateSprint(admin, sprintId, { state: "ACTIVE" });

  const { sprints, report, velocity } = await getProjectReport(reader, projectId, {}, new Date("2026-11-06T12:00:00.000Z"));
  assert.deepEqual(sprints.map(sprint => [sprint.name, sprint.state]), [["Sprint 1", "ACTIVE"]]);
  assert.deepEqual(velocity, []);
  assert.equal(report!.sprint.goal, "Ship reports");
  assert.deepEqual(report!.totals, { total: 4, completed: 2, remaining: 2, carriedOver: 0 });
  assert.deepEqual(report!.byStatus, [{ name: "To Do", done: false, count: 2 }, { name: "Done", done: true, count: 2 }]);
  assert.deepEqual(report!.byAssignee.map(row => [row.assignee?.name ?? null, row.total, row.completed]), [[null, 2, 1], ["Reader", 2, 1]]);
  assert.deepEqual(report!.burndown.map(point => point.remaining), [4, 3, 3, 2, 2, null, null]);
  assert.equal(report!.burndown[0].ideal, 4); assert.equal(report!.burndown.at(-1)!.ideal, 0);
  assert.deepEqual(report!.tickets.map(ticket => ticket.title), ["Still open", "Unassigned and open", "First done", "Second done"]);
  assert.equal(report!.tickets[2].completedAt, "2026-11-03T10:00:00.000Z");
  assert.equal(report!.tickets[0].completedAt, null);
});

test("reports: access follows the project, and sprints of other projects are not found", async () => {
  await rejects(getProjectReport(bystander, projectId, {}), 403);
  const other = await createProject(admin, workspaceId, { name: "Other", key: "OTH" });
  const foreign = await createSprint(admin, other.id, { name: "Elsewhere", startDate: "2026-11-02", endDate: "2026-11-08" });
  await rejects(getProjectReport(admin, projectId, { sprintId: foreign.id }), 404);
  await assert.rejects(getProjectReport(admin, projectId, { sprintId: "not-an-id" }));
  await assert.rejects(getProjectReport(admin, projectId, { unknown: "1" }));
  assert.equal((await getProjectReport(admin, projectId, { sprintId })).report!.sprint.id, sprintId);
});

test("reports: a completed sprint keeps its carried-over count and feeds velocity", async () => {
  const planned = await createSprint(admin, projectId, { name: "Sprint 2", startDate: "2026-11-09", endDate: "2026-11-15" });
  const completed = await updateSprint(admin, sprintId, { state: "COMPLETED" });
  assert.equal(completed.carriedOver, 2);

  // With nothing active, the latest completed sprint is shown rather than the planned one.
  const { report, velocity } = await getProjectReport(admin, projectId, {}, new Date("2026-11-20T00:00:00.000Z"));
  assert.equal(report!.sprint.name, "Sprint 1");
  assert.deepEqual(report!.totals, { total: 4, completed: 2, remaining: 2, carriedOver: 2 });
  assert.equal(report!.tickets.length, 2);
  assert.deepEqual(report!.burndown.map(point => point.remaining), [4, 3, 3, 2, 2, 2, 2]);
  assert.deepEqual(velocity, [{ id: sprintId, name: "Sprint 1", completed: 2, carriedOver: 2 }]);

  const next = (await getProjectReport(admin, projectId, { sprintId: planned.id }, new Date("2026-11-08T00:00:00.000Z"))).report!;
  assert.deepEqual(next.totals, { total: 0, completed: 0, remaining: 0, carriedOver: 0 });
  assert.equal(next.burndown.every(point => point.remaining === null), true);
});

test("overview: shows only the caller's open work in projects they can open", async () => {
  const project = await createProject(admin, workspaceId, { name: "Overview", key: "OVR" });
  await setProjectAccess(admin, project.id, { userId: reader, level: "WRITE" });
  const board = (await getProject(admin, project.id)).boards[0];
  const sprint = await createSprint(admin, project.id, { name: "Overview sprint", startDate: "2026-11-09", endDate: "2026-11-15" });
  const make = (title: string, extra: object = {}) => createTicket(admin, { boardId: board.id, title, assigneeId: reader, ...extra });
  await make("No due date, high", { priority: "HIGH" });
  await make("Due later", { dueDate: "2026-11-20", sprintId: sprint.id });
  await make("Overdue", { dueDate: "2026-11-01", priority: "LOW" });
  const finished = await make("Finished this week", { columnId: board.columns[3].id, sprintId: sprint.id });
  const old = await make("Finished long ago", { columnId: board.columns[3].id });
  await finishedOn(finished.id, "2026-11-09");
  await finishedOn(old.id, "2026-10-01");
  await createTicket(admin, { boardId: board.id, title: "Someone else's", assigneeId: admin });
  await updateSprint(admin, sprint.id, { state: "ACTIVE" });

  const now = new Date("2026-11-10T12:00:00.000Z");
  const overview = await getOverview(reader, workspaceId, now);
  // "Still open" from the earlier RPT sprint test is also assigned to the reader, with no due date.
  assert.deepEqual(overview.tickets.map(ticket => ticket.title), ["Overdue", "Due later", "No due date, high", "Still open"]);
  // "Second done" from the RPT sprint (finished 5 Nov) also falls inside the last seven days.
  assert.deepEqual(overview.stats, { assignedOpen: 4, overdue: 1, completedThisWeek: 2, projects: 2 });
  assert.deepEqual(overview.sprints.map(item => [item.name, item.project.name, item.total, item.completed]), [["Overview sprint", "Overview", 2, 1]]);
  assert.equal(overview.tickets[0].status, "To Do");

  // Losing access to a project removes its tickets and sprints from the overview.
  await setProjectAccess(admin, project.id, { userId: reader, level: null });
  const after = await getOverview(reader, workspaceId, now);
  assert.deepEqual(after.tickets.map(ticket => ticket.title), ["Still open"]);
  assert.deepEqual(after.sprints, []);
  assert.equal(after.stats.projects, 1);
});

test("overview: needs workspace membership, and members without projects see an empty summary", async () => {
  const stranger = (await db.user.create({ data: { name: "Stranger", email: `synk-reports-${randomUUID()}@example.test` } })).id;
  users.push(stranger);
  await rejects(getOverview(stranger, workspaceId), 403);
  assert.deepEqual(await getOverview(bystander, workspaceId), { stats: { assignedOpen: 0, overdue: 0, completedThisWeek: 0, projects: 0 }, tickets: [], sprints: [] });
});
