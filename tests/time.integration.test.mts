import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createProject, getProject, setProjectAccess } = await import("../src/features/projects/service");
const { createTicket, deleteTicket } = await import("../src/features/tickets/service");
const { addTimeEntry, deleteTimeEntry, getActiveTimer, listTimeEntries, startTimer, stopTimer } = await import("../src/features/time/service");

// writer: WRITE. reader: READ. bystander: workspace member without project access. outsider: another workspace.
let admin: string, writer: string, reader: string, bystander: string, outsider: string;
let workspaceId: string, projectId: string, ticketA: string, ticketB: string, otherTicket: string;
const users: string[] = [];
const workspaces: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
const at = (iso: string) => new Date(iso);
const week = { from: "2026-11-09T00:00:00.000Z", to: "2026-11-16T00:00:00.000Z" };

before(async () => {
  for (const name of ["Admin", "Writer", "Reader", "Bystander", "Outsider"]) {
    users.push((await db.user.create({ data: { name, email: `synk-time-${randomUUID()}@example.test` } })).id);
  }
  [admin, writer, reader, bystander, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Time workspace" })).id;
  workspaces.push(workspaceId, (await createWorkspace(outsider, { name: "Elsewhere" })).id);
  for (const id of [writer, reader, bystander]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  projectId = (await createProject(admin, workspaceId, { name: "Time project", key: "TIM" })).id;
  await setProjectAccess(admin, projectId, { userId: writer, level: "WRITE" });
  await setProjectAccess(admin, projectId, { userId: reader, level: "READ" });
  const boardId = (await getProject(admin, projectId)).boards[0].id;
  ticketA = (await createTicket(admin, { boardId, title: "Build the timer" })).id;
  ticketB = (await createTicket(admin, { boardId, title: "Write the report" })).id;
  const other = await createProject(admin, workspaceId, { name: "Other project", key: "OTH" });
  otherTicket = (await createTicket(admin, { boardId: (await getProject(admin, other.id)).boards[0].id, title: "Elsewhere" })).id;
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("timers: starting one stops the running one, and stopping records the time", async () => {
  const first = await startTimer(writer, { ticketId: ticketA }, at("2026-11-10T09:00:00.000Z"));
  assert.deepEqual([first.entry.ticket.title, first.entry.endedAt, first.stopped, first.entry.mine], ["Build the timer", null, null, true]);
  assert.equal((await getActiveTimer(writer))?.id, first.entry.id);

  const second = await startTimer(writer, { ticketId: ticketB, note: "Draft" }, at("2026-11-10T10:30:00.000Z"));
  assert.equal(second.stopped?.id, first.entry.id);
  assert.equal(second.stopped?.endedAt, "2026-11-10T10:30:00.000Z");
  assert.equal(await db.timeEntry.count({ where: { userId: writer, endedAt: null } }), 1);

  const stopped = await stopTimer(writer, at("2026-11-10T11:00:00.000Z"));
  assert.deepEqual([stopped.id, stopped.endedAt, stopped.note], [second.entry.id, "2026-11-10T11:00:00.000Z", "Draft"]);
  assert.equal(await getActiveTimer(writer), null);
  await rejects(stopTimer(writer), 409); // nothing running
});

test("timers: two starts at the same moment leave exactly one running", async () => {
  const results = await Promise.allSettled([1, 2, 3].map(() => startTimer(admin, { ticketId: ticketA }, at("2026-11-11T08:00:00.000Z"))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 3);
  assert.equal(await db.timeEntry.count({ where: { userId: admin, endedAt: null } }), 1);
  await stopTimer(admin, at("2026-11-11T09:00:00.000Z"));
});

test("timers: a timer left running stops counting at 24 hours", async () => {
  await startTimer(admin, { ticketId: ticketB }, at("2026-11-12T08:00:00.000Z"));
  const stopped = await stopTimer(admin, at("2026-11-14T08:00:00.000Z"));
  assert.equal(stopped.endedAt, "2026-11-13T08:00:00.000Z");
});

test("manual entries: must end after they start, last at most a day and not be in the future", async () => {
  const now = at("2026-11-13T18:00:00.000Z");
  const entry = await addTimeEntry(writer, { ticketId: ticketA, startedAt: "2026-11-12T13:00:00+05:00", endedAt: "2026-11-12T15:30:00+05:00", note: " Pairing " }, now);
  assert.deepEqual([entry.startedAt, entry.endedAt, entry.note], ["2026-11-12T08:00:00.000Z", "2026-11-12T10:30:00.000Z", "Pairing"]);
  await rejects(addTimeEntry(writer, { ticketId: ticketA, startedAt: "2026-11-12T10:00:00Z", endedAt: "2026-11-12T09:00:00Z" }, now), 400);
  await rejects(addTimeEntry(writer, { ticketId: ticketA, startedAt: "2026-11-10T09:00:00Z", endedAt: "2026-11-11T09:00:01Z" }, now), 400);
  await rejects(addTimeEntry(writer, { ticketId: ticketA, startedAt: "2026-11-13T19:00:00Z", endedAt: "2026-11-13T20:00:00Z" }, now), 400);
  await assert.rejects(addTimeEntry(writer, { ticketId: ticketA, startedAt: "yesterday", endedAt: "2026-11-13T09:00:00Z" }, now));
  await assert.rejects(addTimeEntry(writer, { ticketId: ticketA, startedAt: "2026-11-12T09:00:00Z", endedAt: "2026-11-12T10:00:00Z", note: "x".repeat(501) }, now));
});

test("access: viewers can read time but not log it, and outsiders see nothing", async () => {
  await rejects(startTimer(reader, { ticketId: ticketA }), 403);
  await rejects(addTimeEntry(reader, { ticketId: ticketA, startedAt: "2026-11-12T09:00:00Z", endedAt: "2026-11-12T10:00:00Z" }), 403);
  for (const user of [bystander, outsider]) await rejects(startTimer(user, { ticketId: ticketA }), 404); // looks missing
  await rejects(startTimer(writer, { ticketId: otherTicket }), 404); // a project the writer cannot open

  const visible = await listTimeEntries(reader, { projectId, ...week });
  assert.ok(visible.length >= 4);
  assert.equal(visible.some(entry => entry.mine), false);
  await rejects(listTimeEntries(bystander, { projectId, ...week }), 403);
  await rejects(listTimeEntries(outsider, { projectId, ...week }), 403);
});

test("listing: filters by range and person, newest first", async () => {
  const all = await listTimeEntries(admin, { projectId, ...week });
  assert.deepEqual(all.map(entry => entry.startedAt), [...all.map(entry => entry.startedAt)].sort().reverse());
  const writers = await listTimeEntries(admin, { projectId, ...week, userId: writer });
  assert.ok(writers.length >= 3 && writers.every(entry => entry.user.id === writer));
  assert.deepEqual(await listTimeEntries(admin, { projectId, from: "2026-12-01T00:00:00Z", to: "2026-12-08T00:00:00Z" }), []);
  await rejects(listTimeEntries(admin, { projectId, from: week.to, to: week.from }), 400);
  await rejects(listTimeEntries(admin, { projectId, from: "2026-01-01T00:00:00Z", to: "2026-12-01T00:00:00Z" }), 400); // over three months
});
