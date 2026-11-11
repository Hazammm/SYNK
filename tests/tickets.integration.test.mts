import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember, removeMember } = await import("../src/features/workspaces/service");
const { createProject, getProject, listProjects, listProjectAccess, setProjectAccess } = await import("../src/features/projects/service");
const { addComment, createBoard, createSprint, createTicket, deleteTicket, findTicketByKey, getTicket, listTickets, updateBoard, updateSprint, updateTicket } = await import("../src/features/tickets/service");
const { listNotifications, markNotificationsRead } = await import("../src/features/notifications/service");

// admin: workspace admin with WRITE. writer: member with WRITE. reader: member with READ.
// bystander: workspace member without project access. outsider: belongs to another workspace.
let admin: string, writer: string, reader: string, bystander: string, outsider: string;
let workspaceId: string, projectId: string, boardId: string;
let columns: { id: string; name: string }[];
const users: string[] = [];
const workspaces: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
const ticket = (title: string, extra: object = {}) => ({ boardId, title, ...extra });
const titlesIn = async (columnId: string) => (await listTickets(admin, { boardId, columnId })).map(row => row.title);

before(async () => {
  for (const name of ["Admin", "Writer", "Reader", "Bystander", "Outsider"]) {
    users.push((await db.user.create({ data: { name, email: `synk-tickets-${randomUUID()}@example.test` } })).id);
  }
  [admin, writer, reader, bystander, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Tracker workspace" })).id;
  workspaces.push(workspaceId, (await createWorkspace(outsider, { name: "Elsewhere" })).id);
  for (const id of [writer, reader, bystander]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  projectId = (await createProject(admin, workspaceId, { name: "Tracker", key: "trk" })).id;
  await setProjectAccess(admin, projectId, { userId: writer, level: "WRITE" });
  await setProjectAccess(admin, projectId, { userId: reader, level: "READ" });
  const board = (await getProject(admin, projectId)).boards[0];
  boardId = board.id; columns = board.columns;
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("projects: only admins create them, keys are unique per workspace, and a default board is ready", async () => {
  await rejects(createProject(writer, workspaceId, { name: "Nope", key: "NOPE" }), 403);
  await rejects(createProject(outsider, workspaceId, { name: "Nope", key: "NOPE" }), 403);
  await rejects(createProject(admin, workspaceId, { name: "Duplicate", key: "TRK" }), 409);
  await assert.rejects(createProject(admin, workspaceId, { name: "Bad key", key: "1-x" })); // validation error
  const detail = await getProject(admin, projectId);
  assert.equal(detail.key, "TRK"); // normalised to upper case
  assert.deepEqual(detail.boards[0].columns.map(column => column.name), ["To Do", "In Progress", "Review", "Done"]);
  assert.deepEqual(detail.boards[0].columns.map(column => column.isDone), [false, false, false, true]);
  assert.deepEqual(detail.members.map(member => member.name).sort(), ["Admin", "Reader", "Writer"]);
});

test("projects: visibility follows access; admins also see projects they have not joined", async () => {
  const hidden = await createProject(admin, workspaceId, { name: "Admin only", key: "HID" });
  assert.deepEqual((await listProjects(writer, workspaceId)).map(project => project.key), ["TRK"]);
  assert.deepEqual((await listProjects(bystander, workspaceId)).length, 0);
  await rejects(listProjects(outsider, workspaceId), 403);
  await rejects(getProject(bystander, projectId), 403);
  await rejects(getProject(outsider, projectId), 403);
  // An admin must grant themselves access before reading tickets: being admin is not a bypass.
  await setProjectAccess(admin, hidden.id, { userId: admin, level: null });
  assert.equal((await listProjects(admin, workspaceId)).find(project => project.key === "HID")?.level, null);
  await rejects(getProject(admin, hidden.id), 403);
  await rejects(listProjectAccess(writer, projectId), 403);
  await rejects(setProjectAccess(writer, projectId, { userId: bystander, level: "WRITE" }), 403);
  await rejects(setProjectAccess(admin, projectId, { userId: outsider, level: "READ" }), 400);
  assert.equal((await listProjectAccess(admin, projectId)).find(entry => entry.id === bystander)?.level, null);
});

test("tickets: READ can view but not change; no access looks like a missing ticket", async () => {
  const created = await createTicket(writer, ticket("Readable ticket", { description: "Body", priority: "HIGH" }));
  assert.match(created.key, /^TRK-\d+$/);
  assert.equal(created.reporter?.id, writer);
  assert.equal(created.columnId, columns[0].id);
  assert.equal((await getTicket(reader, created.id)).title, "Readable ticket");
  assert.ok((await listTickets(reader, { boardId })).some(row => row.id === created.id));
  await rejects(createTicket(reader, ticket("Denied")), 403);
  await rejects(updateTicket(reader, created.id, { title: "Denied" }), 403);
  await rejects(addComment(reader, created.id, { body: "Denied" }), 403);
  await rejects(createBoard(reader, projectId, { name: "Denied" }), 403);
  await rejects(createSprint(reader, projectId, { name: "Denied", startDate: "2026-11-01", endDate: "2026-11-07" }), 403);
  for (const stranger of [bystander, outsider]) {
    await rejects(getTicket(stranger, created.id), 404);
    await rejects(updateTicket(stranger, created.id, { title: "Denied" }), 404);
    await rejects(addComment(stranger, created.id, { body: "Denied" }), 404);
    await rejects(listTickets(stranger, { boardId }), 403);
    await rejects(createTicket(stranger, ticket("Denied")), 403);
    assert.equal(await findTicketByKey(stranger, workspaceId, created.key), null);
  }
  assert.equal((await findTicketByKey(reader, workspaceId, created.key))?.id, created.id);
  assert.equal((await getTicket(writer, created.id)).title, "Readable ticket"); // nothing was changed
});

test("tickets: concurrent creation hands out distinct, gap-free keys", async () => {
  const before = (await db.project.findUniqueOrThrow({ where: { id: projectId } })).nextTicketNumber;
  const created = await Promise.all(Array.from({ length: 12 }, (_, index) => createTicket(index % 2 ? admin : writer, ticket(`Concurrent ${index}`))));
  const numbers = created.map(row => Number(row.key.split("-")[1])).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 12 }, (_, index) => before + index));
});

test("tickets: references must belong to the same project and board", async () => {
  const otherProject = await createProject(admin, workspaceId, { name: "Second", key: "SEC" });
  const otherBoard = (await getProject(admin, otherProject.id)).boards[0];
  const otherSprint = await createSprint(admin, otherProject.id, { name: "Foreign sprint", startDate: "2026-11-01", endDate: "2026-11-07" });
  await rejects(createTicket(writer, ticket("Bad column", { columnId: otherBoard.columns[0].id })), 400);
  await rejects(createTicket(writer, ticket("Bad sprint", { sprintId: otherSprint.id })), 400);
  await rejects(createTicket(writer, ticket("Bad assignee", { assigneeId: bystander })), 400);
  await rejects(createTicket(writer, ticket("Bad assignee", { assigneeId: outsider })), 400);
  const created = await createTicket(writer, ticket("Valid", { dueDate: "2026-12-31", assigneeId: reader }));
  assert.equal(created.dueDate, "2026-12-31");
  await rejects(updateTicket(writer, created.id, { columnId: otherBoard.columns[0].id }), 400);
  await rejects(updateTicket(writer, created.id, { sprintId: otherSprint.id }), 400);
  await rejects(updateTicket(writer, created.id, { assigneeId: outsider }), 400);
  await assert.rejects(updateTicket(writer, created.id, { dueDate: "31/12/2026" })); // wrong date format
  await assert.rejects(updateTicket(writer, created.id, {})); // nothing to update
  await assert.rejects(updateTicket(writer, created.id, { reporterId: outsider })); // unknown fields are refused
  const cleared = await updateTicket(writer, created.id, { dueDate: null, assigneeId: null });
  assert.equal(cleared.dueDate, null); assert.equal(cleared.assignee, null);
});

test("tickets: moving reorders within a column and across columns", async () => {
  const board = await createBoard(writer, projectId, { name: "Ordering", columns: [{ name: "Open" }, { name: "Closed", isDone: true }] });
  const [open, closed] = board.columns;
  const make = (title: string) => createTicket(writer, { boardId: board.id, title });
  const a = await make("a"), b = await make("b"), c = await make("c");
  const titles = async (columnId: string) => (await listTickets(writer, { boardId: board.id, columnId })).map(row => row.title);
  assert.deepEqual(await titles(open.id), ["a", "b", "c"]);
  await updateTicket(writer, c.id, { position: 0 });
  assert.deepEqual(await titles(open.id), ["c", "a", "b"]);
  await updateTicket(writer, a.id, { columnId: closed.id });
  assert.deepEqual(await titles(open.id), ["c", "b"]);
  assert.deepEqual(await titles(closed.id), ["a"]);
  await updateTicket(writer, b.id, { columnId: closed.id, position: 0 });
  assert.deepEqual(await titles(closed.id), ["b", "a"]);
  await updateTicket(writer, c.id, { columnId: closed.id, position: 99 }); // past the end clamps to last
  assert.deepEqual(await titles(closed.id), ["b", "a", "c"]);
  // Simultaneous moves into one column must still leave a clean 0..n-1 ordering.
  const extra = await Promise.all(["d", "e", "f", "g"].map(make));
  await Promise.all(extra.map((row, index) => updateTicket(index % 2 ? admin : writer, row.id, { columnId: closed.id, position: 0 })));
  const positions = (await listTickets(writer, { boardId: board.id, columnId: closed.id })).map(row => row.position);
  assert.deepEqual(positions, [0, 1, 2, 3, 4, 5, 6]);
});

test("tickets: filters by assignee, priority, status column and sprint", async () => {
  const board = await createBoard(writer, projectId, { name: "Filters" });
  const sprint = await createSprint(writer, projectId, { name: "Filter sprint", startDate: "2026-11-01", endDate: "2026-11-14" });
  const make = (title: string, extra: object = {}) => createTicket(writer, { boardId: board.id, title, ...extra });
  await make("high-writer-sprint", { priority: "HIGH", assigneeId: writer, sprintId: sprint.id });
  await make("low-reader", { priority: "LOW", assigneeId: reader });
  await make("medium-unassigned-done", { columnId: board.columns[3].id });
  const find = async (filter: object) => (await listTickets(reader, { boardId: board.id, ...filter })).map(row => row.title).sort();
  assert.deepEqual(await find({ priority: "HIGH" }), ["high-writer-sprint"]);
  assert.deepEqual(await find({ assigneeId: reader }), ["low-reader"]);
  assert.deepEqual(await find({ assigneeId: "none" }), ["medium-unassigned-done"]);
  assert.deepEqual(await find({ columnId: board.columns[3].id }), ["medium-unassigned-done"]);
  assert.deepEqual(await find({ sprintId: sprint.id }), ["high-writer-sprint"]);
  assert.deepEqual(await find({ sprintId: "none" }), ["low-reader", "medium-unassigned-done"]);
  assert.deepEqual(await find({ sprintId: "none", priority: "LOW", assigneeId: reader }), ["low-reader"]);
  assert.ok((await listTickets(reader, { projectId, sprintId: sprint.id })).length === 1);
  await assert.rejects(listTickets(reader, {})); // a board or project is required
  await assert.rejects(listTickets(reader, { boardId: board.id, projectId })); // but not both
});

test("comments: assignees and mentioned people are notified once, and only if they can open the ticket", async () => {
  const created = await createTicket(admin, ticket("Notify me", { assigneeId: writer }));
  const own = await createTicket(writer, ticket("Self-assigned", { assigneeId: writer }));
  const types = async (userId: string, ticketId = created.id) => (await listNotifications(userId)).notifications.filter(item => item.ticket.id === ticketId).map(item => item.type).sort();
  assert.deepEqual(await types(writer), ["TICKET_ASSIGNED"]);
  assert.deepEqual(await types(writer, own.id), []); // assigning yourself is not news
  const comment = await addComment(admin, created.id, { body: "  @Reader please review  ", mentionIds: [reader, bystander, outsider, admin, "missing-user"] });
  assert.equal(comment.body, "@Reader please review");
  assert.deepEqual(await types(reader), ["TICKET_MENTION"]);
  assert.deepEqual(await types(writer), ["TICKET_ASSIGNED", "TICKET_COMMENT"]);
  assert.deepEqual(await types(admin), []); // authors are not notified about their own comment
  assert.deepEqual(await types(bystander), []);
  assert.deepEqual(await types(outsider), []);
  await addComment(admin, created.id, { body: "@Writer both", mentionIds: [writer] });
  assert.deepEqual(await types(writer), ["TICKET_ASSIGNED", "TICKET_COMMENT", "TICKET_MENTION"]); // mention replaces, not duplicates, the comment alert
  const detail = await getTicket(reader, created.id);
  assert.deepEqual(detail.comments.map(row => row.author.name), ["Admin", "Admin"]);
  assert.equal(detail.commentCount, 2);
  await updateTicket(writer, created.id, { assigneeId: reader });
  assert.deepEqual(await types(reader), ["TICKET_ASSIGNED", "TICKET_MENTION"]);

  const inbox = await listNotifications(reader);
  const mention = inbox.notifications.find(item => item.type === "TICKET_MENTION" && item.ticket.id === created.id)!;
  assert.equal(mention.excerpt, "@Reader please review"); assert.equal(mention.actor?.name, "Admin"); assert.equal(mention.read, false);
  // Marking someone else's notification does nothing.
  assert.equal((await markNotificationsRead(writer, { ids: [mention.id] })).updated, 0);
  assert.equal((await markNotificationsRead(reader, { ids: [mention.id] })).updated, 1);
  assert.equal((await listNotifications(reader)).unread, inbox.unread - 1);
  await markNotificationsRead(reader, {});
  assert.equal((await listNotifications(reader)).unread, 0);
});

test("access removal hides notifications and unassigns tickets", async () => {
  const temp = (await db.user.create({ data: { name: "Temp", email: `synk-tickets-${randomUUID()}@example.test` } })).id; users.push(temp);
  await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id: temp } })).email);
  await setProjectAccess(admin, projectId, { userId: temp, level: "WRITE" });
  const first = await createTicket(admin, ticket("Temp's work", { assigneeId: temp }));
  assert.equal((await listNotifications(temp)).notifications.length, 1);
  await setProjectAccess(admin, projectId, { userId: temp, level: null });
  assert.equal((await listNotifications(temp)).notifications.length, 0);
  assert.equal((await getTicket(admin, first.id)).assignee, null);
  await rejects(getTicket(temp, first.id), 404);

  await setProjectAccess(admin, projectId, { userId: temp, level: "WRITE" });
  const second = await createTicket(admin, ticket("Temp again", { assigneeId: temp }));
  await removeMember(admin, workspaceId, temp);
  assert.equal((await getTicket(admin, second.id)).assignee, null);
  await rejects(getTicket(temp, second.id), 404);
  await rejects(createTicket(temp, ticket("Denied")), 403);
  assert.equal(await db.projectAccess.count({ where: { userId: temp } }), 0);
  assert.equal((await getProject(admin, projectId)).members.some(member => member.id === temp), false);
});

test("tickets: deleting needs edit access, removes comments and alerts, and never reuses the key", async () => {
  const doomed = await createTicket(admin, ticket("Delete me", { assigneeId: writer }));
  await addComment(admin, doomed.id, { body: "Soon gone" });
  assert.equal((await listNotifications(writer)).notifications.filter(item => item.ticket.id === doomed.id).length, 2);

  await rejects(deleteTicket(reader, doomed.id), 403);
  await rejects(deleteTicket(bystander, doomed.id), 404);
  await rejects(deleteTicket(outsider, doomed.id), 404);
  assert.deepEqual(await deleteTicket(writer, doomed.id), { id: doomed.id, key: doomed.key });

  await rejects(getTicket(admin, doomed.id), 404);
  await rejects(deleteTicket(admin, doomed.id), 404);
  assert.equal(await db.comment.count({ where: { ticketId: doomed.id } }), 0);
  assert.equal((await listNotifications(writer)).notifications.some(item => item.ticket.id === doomed.id), false);
  const next = await createTicket(admin, ticket("After the delete"));
  assert.notEqual(next.key, doomed.key);
});

test("boards: columns can be renamed, reordered, added and removed only when empty", async () => {
  const board = await createBoard(writer, projectId, { name: "Configurable", columns: [{ name: "Backlog" }, { name: "Doing" }, { name: "Shipped", isDone: true }] });
  const [backlog, doing, shipped] = board.columns;
  const held = await createTicket(writer, { boardId: board.id, title: "Held", columnId: doing.id });
  await rejects(createBoard(writer, projectId, { name: "Dupes", columns: [{ name: "Same" }, { name: "same" }] }), 400);
  await rejects(updateBoard(writer, board.id, { columns: [{ id: backlog.id, name: "Backlog" }, { id: shipped.id, name: "Shipped", isDone: true }] }), 409); // Doing still holds a ticket
  await rejects(updateBoard(writer, board.id, { columns: [{ id: columns[0].id, name: "Stolen" }] }), 400); // column of another board
  await rejects(updateBoard(reader, board.id, { name: "Denied" }), 403);
  const updated = await updateBoard(writer, board.id, { name: "Renamed", columns: [
    { id: doing.id, name: "In flight" }, { name: "QA" }, { id: backlog.id, name: "Backlog" }, { id: shipped.id, name: "Shipped", isDone: true },
  ] });
  assert.equal(updated.name, "Renamed");
  assert.deepEqual(updated.columns.map(column => column.name), ["In flight", "QA", "Backlog", "Shipped"]);
  assert.deepEqual(updated.columns.map(column => column.position), [0, 1, 2, 3]);
  assert.equal((await getTicket(writer, held.id)).columnId, doing.id); // the ticket followed its renamed column
  const trimmed = await updateBoard(writer, board.id, { columns: updated.columns.filter(column => column.name !== "QA").map(({ id, name, isDone }) => ({ id, name, isDone })) });
  assert.deepEqual(trimmed.columns.map(column => column.name), ["In flight", "Backlog", "Shipped"]);
});

test("sprints: one active sprint per project; completing returns unfinished work to the backlog", async () => {
  const project = await createProject(admin, workspaceId, { name: "Sprint project", key: "SPR" });
  await setProjectAccess(admin, project.id, { userId: writer, level: "WRITE" });
  const board = (await getProject(admin, project.id)).boards[0];
  const dates = { startDate: "2026-11-02", endDate: "2026-11-08" };
  await assert.rejects(createSprint(writer, project.id, { name: "Backwards", startDate: "2026-11-08", endDate: "2026-11-02" }));
  const [one, two, three] = await Promise.all(["One", "Two", "Three"].map(name => createSprint(writer, project.id, { name, ...dates })));
  const done = await createTicket(writer, { boardId: board.id, title: "Finished", sprintId: one.id, columnId: board.columns[3].id });
  const open = await createTicket(writer, { boardId: board.id, title: "Unfinished", sprintId: one.id });
  await rejects(updateSprint(writer, one.id, { state: "COMPLETED" }), 409); // not started yet
  // Two people press Start on different sprints at the same moment: exactly one wins.
  const results = await Promise.allSettled([updateSprint(writer, two.id, { state: "ACTIVE" }), updateSprint(admin, three.id, { state: "ACTIVE" })]);
  assert.deepEqual(results.map(result => result.status).sort(), ["fulfilled", "rejected"]);
  const active = results[0].status === "fulfilled" ? two : three;
  await rejects(updateSprint(writer, one.id, { state: "ACTIVE" }), 409);
  await updateSprint(writer, active.id, { state: "COMPLETED" });
  assert.equal((await updateSprint(writer, one.id, { state: "ACTIVE", name: "One (renamed)" })).state, "ACTIVE");
  await rejects(updateSprint(writer, one.id, { endDate: "2026-11-01" }), 400);
  const completed = await updateSprint(writer, one.id, { state: "COMPLETED" });
  assert.equal(completed.state, "COMPLETED"); assert.ok(completed.completedAt);
  assert.equal((await getTicket(writer, done.id)).sprintId, one.id);
  assert.equal((await getTicket(writer, open.id)).sprintId, null);
  await rejects(updateSprint(writer, one.id, { name: "Again" }), 409);
  await rejects(updateTicket(writer, open.id, { sprintId: one.id }), 400); // completed sprints are closed
  await rejects(createTicket(writer, { boardId: board.id, title: "Late", sprintId: one.id }), 400);
  assert.deepEqual((await getProject(writer, project.id)).sprints.map(sprint => sprint.state).sort(), ["COMPLETED", "COMPLETED", "PLANNED"]);
});

test("isolation: the same project key and ticket key in another workspace stay separate", async () => {
  const elsewhere = await createProject(outsider, workspaces[1], { name: "Elsewhere tracker", key: "TRK" });
  const board = (await getProject(outsider, elsewhere.id)).boards[0];
  const theirs = await createTicket(outsider, { boardId: board.id, title: "Their TRK-1" });
  assert.equal(theirs.key, "TRK-1");
  assert.equal((await findTicketByKey(outsider, workspaces[1], "TRK-1"))?.id, theirs.id);
  assert.notEqual((await findTicketByKey(admin, workspaceId, "TRK-1"))?.id, theirs.id);
  assert.equal(await findTicketByKey(admin, workspaces[1], "TRK-1"), null);
  assert.equal(await findTicketByKey(admin, workspaceId, "trk-1'; --"), null);
  await rejects(getTicket(admin, theirs.id), 404);
  assert.deepEqual(await titlesIn(columns[3].id), []);
});
