import { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { can, requireProject, type ProjectAction } from "../../lib/permissions";
import {
  boardSchema, boardUpdateSchema, commentSchema, idSchema, sprintSchema, sprintUpdateSchema,
  ticketFilterSchema, ticketSchema, ticketUpdateSchema,
} from "../../lib/validation";
import { boardInclude, createBoardRecord, isoDate, serializeBoard, serializeSprint } from "../projects/service";
import type { BoardSummary, SprintSummary, TicketComment, TicketDetail, TicketSummary } from "../../lib/ticket-types";

type Database = Prisma.TransactionClient;
const MAX_LISTED_TICKETS = 500;
const MAX_LISTED_COMMENTS = 200;
const person = { select: { id: true, name: true } } satisfies Prisma.UserDefaultArgs;
const summaryInclude = { assignee: person, _count: { select: { comments: true } } } satisfies Prisma.TicketInclude;
const detailInclude = {
  ...summaryInclude, reporter: person,
  comments: { include: { author: person }, orderBy: { createdAt: "asc" }, take: MAX_LISTED_COMMENTS },
} satisfies Prisma.TicketInclude;
type SummaryRecord = Prisma.TicketGetPayload<{ include: typeof summaryInclude }>;
type DetailRecord = Prisma.TicketGetPayload<{ include: typeof detailInclude }>;
type CommentRecord = DetailRecord["comments"][number];
const ticketOrder = [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }] satisfies Prisma.TicketOrderByWithRelationInput[];

function serializeTicket(row: SummaryRecord): TicketSummary {
  return {
    id: row.id, key: row.key, projectId: row.projectId, boardId: row.boardId, columnId: row.columnId, sprintId: row.sprintId,
    title: row.title, priority: row.priority, position: row.position, dueDate: row.dueDate ? isoDate(row.dueDate) : null,
    completedAt: row.completedAt?.toISOString() ?? null, assignee: row.assignee, commentCount: row._count.comments,
  };
}
const serializeComment = (row: CommentRecord): TicketComment => ({ id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), author: row.author });
function serializeDetail(row: DetailRecord): TicketDetail {
  return {
    ...serializeTicket(row), description: row.description, reporter: row.reporter,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), comments: row.comments.map(serializeComment),
  };
}

// A ticket the caller cannot read is reported as missing, so its existence is not revealed.
async function requireTicket(userId: string, ticketId: string, action: ProjectAction, database: Database = db) {
  idSchema.parse(ticketId);
  const ticket = await database.ticket.findUnique({ where: { id: ticketId } });
  const access = ticket && await requireProject(userId, ticket.projectId, "ticket:read", database).catch(() => null);
  if (!ticket || !access) throw new AppError(404, "Ticket not found.");
  if (!can(action, { role: access.role, projectLevel: access.level })) throw new AppError(403, "You have read-only access to this project.");
  return { ticket, project: access.project };
}

// Rows locked FOR UPDATE serialize concurrent changes that must not interleave.
const lockBoard = (database: Database, boardId: string) => database.$executeRaw`SELECT 1 FROM "Board" WHERE "id" = ${boardId} FOR UPDATE`;
const lockProject = (database: Database, projectId: string) => database.$executeRaw`SELECT 1 FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;

async function assertAssignable(database: Database, projectId: string, workspaceId: string, userId: string) {
  const access = await database.projectAccess.findFirst({ where: { projectId, userId, user: { memberships: { some: { workspaceId } } } } });
  if (!access) throw new AppError(400, "Tickets can only be assigned to people with access to this project.");
}
async function assertOpenSprint(database: Database, projectId: string, sprintId: string) {
  const sprint = await database.sprint.findFirst({ where: { id: sprintId, projectId } });
  if (!sprint) throw new AppError(400, "That sprint does not belong to this project.");
  if (sprint.state === "COMPLETED") throw new AppError(400, "Completed sprints cannot take new tickets.");
}

// ── Boards ───────────────────────────────────────────────────────────────────

export async function createBoard(userId: string, projectId: string, input: unknown): Promise<BoardSummary> {
  const data = boardSchema.parse(input);
  assertDistinctColumns(data.columns ?? []);
  return db.$transaction(async tx => {
    await requireProject(userId, projectId, "board:manage", tx);
    return serializeBoard(await createBoardRecord(tx, projectId, data.name, data.columns));
  });
}

function assertDistinctColumns(columns: { name: string }[]) {
  const names = columns.map(column => column.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new AppError(400, "Column names must be different from each other.");
}

// `columns` is the complete new list in display order: entries with an id are kept
// (renamed or moved), entries without are created, and omitted columns are deleted.
export async function updateBoard(userId: string, boardId: string, input: unknown): Promise<BoardSummary> {
  const data = boardUpdateSchema.parse(input);
  idSchema.parse(boardId);
  if (data.columns) assertDistinctColumns(data.columns);
  return db.$transaction(async tx => {
    const found = await tx.board.findUnique({ where: { id: boardId }, select: { projectId: true } });
    if (!found) throw new AppError(404, "Board not found.");
    await requireProject(userId, found.projectId, "board:manage", tx);
    // Read the columns only after taking the lock, so two edits cannot work from the same stale list.
    await lockBoard(tx, boardId);
    const board = await tx.board.findUniqueOrThrow({ where: { id: boardId }, include: boardInclude });
    if (data.name) await tx.board.update({ where: { id: boardId }, data: { name: data.name } });
    if (data.columns) {
      const kept = new Set(data.columns.flatMap(column => column.id ?? []));
      for (const id of kept) if (!board.columns.some(column => column.id === id)) throw new AppError(400, "A column in this request does not belong to the board.");
      for (const column of board.columns) {
        if (kept.has(column.id)) continue;
        // Counted inside the lock: a ticket moved in concurrently cannot be orphaned.
        if (await tx.ticket.count({ where: { columnId: column.id } })) throw new AppError(409, `Move the tickets out of “${column.name}” before removing it.`);
        await tx.boardColumn.delete({ where: { id: column.id } });
      }
      for (const [position, { id, ...column }] of data.columns.entries()) {
        if (id) {
          await tx.boardColumn.update({ where: { id }, data: { ...column, position } });
          // Changing what counts as done changes which of the column's tickets are completed.
          if (board.columns.find(existing => existing.id === id)!.isDone !== column.isDone) {
            await tx.ticket.updateMany({ where: { columnId: id, ...(column.isDone && { completedAt: null }) }, data: { completedAt: column.isDone ? new Date() : null } });
          }
        }
        else await tx.boardColumn.create({ data: { ...column, position, boardId } });
      }
    }
    return serializeBoard(await tx.board.findUniqueOrThrow({ where: { id: boardId }, include: boardInclude }));
  });
}

// ── Sprints ──────────────────────────────────────────────────────────────────

export async function createSprint(userId: string, projectId: string, input: unknown): Promise<SprintSummary> {
  const data = sprintSchema.parse(input);
  await requireProject(userId, projectId, "sprint:manage");
  return serializeSprint(await db.sprint.create({ data: { ...data, projectId } }));
}

export async function updateSprint(userId: string, sprintId: string, input: unknown): Promise<SprintSummary> {
  const { state, ...fields } = sprintUpdateSchema.parse(input);
  idSchema.parse(sprintId);
  return db.$transaction(async tx => {
    const found = await tx.sprint.findUnique({ where: { id: sprintId }, select: { projectId: true } });
    if (!found) throw new AppError(404, "Sprint not found.");
    await requireProject(userId, found.projectId, "sprint:manage", tx);
    // Serializes sprint state changes per project, so two sprints cannot both become active.
    await lockProject(tx, found.projectId);
    const sprint = await tx.sprint.findUniqueOrThrow({ where: { id: sprintId } });
    if (sprint.state === "COMPLETED") throw new AppError(409, "This sprint is already completed.");
    const startDate = fields.startDate ?? sprint.startDate, endDate = fields.endDate ?? sprint.endDate;
    if (endDate < startDate) throw new AppError(400, "The end date cannot be before the start date.");
    const data: Prisma.SprintUpdateInput = { ...fields };
    if (state === "ACTIVE" && sprint.state === "PLANNED") {
      const active = await tx.sprint.findFirst({ where: { projectId: sprint.projectId, state: "ACTIVE" } });
      if (active) throw new AppError(409, `Complete “${active.name}” before starting another sprint.`);
      data.state = "ACTIVE";
    } else if (state === "COMPLETED") {
      if (sprint.state !== "ACTIVE") throw new AppError(409, "Start the sprint before completing it.");
      data.state = "COMPLETED";
      data.completedAt = new Date();
      // Unfinished work returns to the backlog; finished tickets stay as the sprint's record.
      const { count } = await tx.ticket.updateMany({ where: { sprintId, column: { isDone: false } }, data: { sprintId: null } });
      data.carriedOver = count; // kept for the sprint report, which can no longer see those tickets
    }
    return serializeSprint(await tx.sprint.update({ where: { id: sprintId }, data }));
  });
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export async function listTickets(userId: string, input: unknown): Promise<TicketSummary[]> {
  const { boardId, projectId, assigneeId, sprintId, priority, columnId } = ticketFilterSchema.parse(input);
  const scope = projectId ?? (await db.board.findUnique({ where: { id: boardId! }, select: { projectId: true } }))?.projectId;
  if (!scope) throw new AppError(404, "Board not found.");
  await requireProject(userId, scope, "ticket:read");
  const rows = await db.ticket.findMany({
    where: {
      projectId: scope, boardId, priority, columnId,
      ...(assigneeId && { assigneeId: assigneeId === "none" ? null : assigneeId }),
      ...(sprintId && { sprintId: sprintId === "none" ? null : sprintId }),
    },
    include: summaryInclude, orderBy: ticketOrder, take: MAX_LISTED_TICKETS,
  });
  return rows.map(serializeTicket);
}

export async function createTicket(userId: string, input: unknown): Promise<TicketDetail> {
  const { boardId, columnId, ...data } = ticketSchema.parse(input);
  return db.$transaction(async tx => {
    const board = await tx.board.findUnique({ where: { id: boardId }, include: boardInclude });
    if (!board) throw new AppError(404, "Board not found.");
    const { project } = await requireProject(userId, board.projectId, "ticket:write", tx);
    const column = columnId ? board.columns.find(item => item.id === columnId) : board.columns[0];
    if (!column) throw new AppError(400, "That status column does not belong to this board.");
    if (data.assigneeId) await assertAssignable(tx, project.id, project.workspaceId, data.assigneeId);
    if (data.sprintId) await assertOpenSprint(tx, project.id, data.sprintId);
    // The increment takes a row lock, so concurrent creates receive distinct numbers.
    const { nextTicketNumber } = await tx.project.update({ where: { id: project.id }, data: { nextTicketNumber: { increment: 1 } } });
    const last = await tx.ticket.aggregate({ where: { columnId: column.id }, _max: { position: true } });
    const ticket = await tx.ticket.create({
      data: {
        ...data, projectId: project.id, boardId, columnId: column.id, reporterId: userId,
        key: `${project.key}-${nextTicketNumber - 1}`, position: (last._max.position ?? -1) + 1,
        completedAt: column.isDone ? new Date() : null,
      },
      include: detailInclude,
    });
    if (ticket.assigneeId && ticket.assigneeId !== userId) {
      await tx.notification.create({ data: { type: "TICKET_ASSIGNED", recipientId: ticket.assigneeId, actorId: userId, ticketId: ticket.id } });
    }
    return serializeDetail(ticket);
  });
}

export async function getTicket(userId: string, ticketId: string): Promise<TicketDetail> {
  await requireTicket(userId, ticketId, "ticket:read");
  return serializeDetail(await db.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: detailInclude }));
}

// Chat links carry only a workspace and a ticket key such as SYN-12.
export async function findTicketByKey(userId: string, workspaceId: string, key: string) {
  if (!idSchema.safeParse(workspaceId).success || !/^[A-Z][A-Z0-9]{1,9}-[1-9]\d*$/.test(key)) return null;
  return db.ticket.findFirst({
    where: { key, project: { workspaceId, access: { some: { userId } }, workspace: { memberships: { some: { userId } } } } },
    select: { id: true, projectId: true, boardId: true }, orderBy: { createdAt: "asc" },
  });
}

export async function updateTicket(userId: string, ticketId: string, input: unknown): Promise<TicketDetail> {
  const { columnId, position, ...fields } = ticketUpdateSchema.parse(input);
  return db.$transaction(async tx => {
    const { ticket, project } = await requireTicket(userId, ticketId, "ticket:write", tx);
    if (fields.assigneeId) await assertAssignable(tx, project.id, project.workspaceId, fields.assigneeId);
    if (fields.sprintId && fields.sprintId !== ticket.sprintId) await assertOpenSprint(tx, project.id, fields.sprintId);
    const data: Prisma.TicketUncheckedUpdateInput = { ...fields };
    if (columnId !== undefined || position !== undefined) {
      await lockBoard(tx, ticket.boardId);
      const target = columnId ?? ticket.columnId;
      const column = await tx.boardColumn.findFirst({ where: { id: target, boardId: ticket.boardId } });
      if (!column) throw new AppError(400, "That status column does not belong to this board.");
      // Entering a done column stamps the completion time; leaving clears it. Moving between done columns keeps it.
      if (target !== ticket.columnId) data.completedAt = column.isDone ? ticket.completedAt ?? new Date() : null;
      // Re-read the column inside the lock, insert the ticket at the requested index and renumber.
      const others = await tx.ticket.findMany({ where: { columnId: target, id: { not: ticketId } }, orderBy: ticketOrder, select: { id: true, position: true } });
      const index = Math.min(position ?? others.length, others.length);
      const order = [...others.slice(0, index).map(row => row.id), ticketId, ...others.slice(index).map(row => row.id)];
      for (const [place, id] of order.entries()) {
        if (id === ticketId) { data.columnId = target; data.position = place; }
        else if (others.find(row => row.id === id)!.position !== place) await tx.ticket.update({ where: { id }, data: { position: place } });
      }
    }
    const updated = await tx.ticket.update({ where: { id: ticketId }, data, include: detailInclude });
    if (updated.assigneeId && updated.assigneeId !== ticket.assigneeId && updated.assigneeId !== userId) {
      await tx.notification.create({ data: { type: "TICKET_ASSIGNED", recipientId: updated.assigneeId, actorId: userId, ticketId } });
    }
    return serializeDetail(updated);
  });
}

// Comments and notifications go with the ticket. Its key is never reused, because numbering only moves forward.
export async function deleteTicket(userId: string, ticketId: string): Promise<{ id: string; key: string }> {
  return db.$transaction(async tx => {
    const { ticket } = await requireTicket(userId, ticketId, "ticket:delete", tx);
    // deleteMany reports a count instead of throwing, so losing a race with another delete is a clean 404.
    const { count } = await tx.ticket.deleteMany({ where: { id: ticketId } });
    if (!count) throw new AppError(404, "Ticket not found.");
    return { id: ticket.id, key: ticket.key };
  });
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function addComment(userId: string, ticketId: string, input: unknown): Promise<TicketComment> {
  const data = commentSchema.parse(input);
  return db.$transaction(async tx => {
    const { ticket, project } = await requireTicket(userId, ticketId, "ticket:comment", tx);
    const comment = await tx.comment.create({ data: { ticketId, authorId: userId, body: data.body }, include: { author: person } });
    // Mentions only reach people who can open the ticket; unknown or outside IDs are dropped.
    const mentioned = await tx.projectAccess.findMany({
      where: { projectId: project.id, userId: { in: data.mentionIds, not: userId }, user: { memberships: { some: { workspaceId: project.workspaceId } } } },
      select: { userId: true },
    });
    const recipients = new Map<string, "TICKET_MENTION" | "TICKET_COMMENT">(mentioned.map(entry => [entry.userId, "TICKET_MENTION"]));
    // The assignee hears about every comment; a mention already covers it.
    if (ticket.assigneeId && ticket.assigneeId !== userId && !recipients.has(ticket.assigneeId)) recipients.set(ticket.assigneeId, "TICKET_COMMENT");
    if (recipients.size) {
      await tx.notification.createMany({ data: [...recipients].map(([recipientId, type]) => ({ type, recipientId, actorId: userId, ticketId, commentId: comment.id })) });
    }
    return serializeComment(comment);
  });
}
