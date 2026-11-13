import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireProject, type ProjectAction } from "../../lib/permissions";
import { idSchema, timeEntrySchema, timeListSchema, timerStartSchema } from "../../lib/validation";
import { MAX_ENTRY_HOURS, type TimeEntry, type TimerStart } from "../../lib/time-types";

type Database = Prisma.TransactionClient;
const HOUR_MS = 3_600_000;
const MAX_LISTED = 2000;
const include = { user: { select: { id: true, name: true } }, ticket: { select: { id: true, key: true, title: true, projectId: true } } } satisfies Prisma.TimeEntryInclude;
type Record = Prisma.TimeEntryGetPayload<{ include: typeof include }>;

const serialize = (row: Record, userId: string): TimeEntry => ({
  id: row.id, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, note: row.note,
  user: row.user, ticket: row.ticket, mine: row.userId === userId,
});

// A ticket the caller cannot open is reported as missing, so its existence is not revealed.
async function requireTicket(userId: string, ticketId: string, action: ProjectAction, database: Database = db) {
  idSchema.parse(ticketId);
  const ticket = await database.ticket.findUnique({ where: { id: ticketId }, select: { id: true, projectId: true } });
  const readable = ticket && await requireProject(userId, ticket.projectId, "time:read", database).catch(() => null);
  if (!ticket || !readable) throw new AppError(404, "Ticket not found.");
  await requireProject(userId, ticket.projectId, action, database).catch(() => {
    throw new AppError(403, "You have view-only access to this project, so you can't log time on its tickets.");
  });
  return ticket;
}

// Locking the person's row means two timers started at once cannot both be running.
const lockUser = (database: Database, userId: string) => database.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

// A timer left running for more than a day stops counting at 24 hours.
const endFor = (startedAt: Date, now: Date) => new Date(Math.min(now.getTime(), startedAt.getTime() + MAX_ENTRY_HOURS * HOUR_MS));

async function stopRunning(database: Database, userId: string, now: Date) {
  const running = await database.timeEntry.findFirst({ where: { userId, endedAt: null } });
  if (!running) return null;
  return database.timeEntry.update({ where: { id: running.id }, data: { endedAt: endFor(running.startedAt, now) }, include });
}

export async function getActiveTimer(userId: string): Promise<TimeEntry | null> {
  const running = await db.timeEntry.findFirst({
    where: { userId, endedAt: null, project: { access: { some: { userId } } } }, include,
  });
  return running && serialize(running, userId);
}

// Starting a timer stops the one already running, so each person has at most one.
export async function startTimer(userId: string, input: unknown, now = new Date()): Promise<TimerStart> {
  const { ticketId, note } = timerStartSchema.parse(input);
  return db.$transaction(async tx => {
    const ticket = await requireTicket(userId, ticketId, "time:log", tx);
    await lockUser(tx, userId);
    const stopped = await stopRunning(tx, userId, now);
    const entry = await tx.timeEntry.create({ data: { userId, ticketId, projectId: ticket.projectId, startedAt: now, note }, include });
    return { entry: serialize(entry, userId), stopped: stopped && serialize(stopped, userId) };
  });
}

export async function stopTimer(userId: string, now = new Date()): Promise<TimeEntry> {
  return db.$transaction(async tx => {
    await lockUser(tx, userId);
    const stopped = await stopRunning(tx, userId, now);
    if (!stopped) throw new AppError(409, "No timer is running.");
    return serialize(stopped, userId);
  });
}

// Time worked earlier, added by hand.
export async function addTimeEntry(userId: string, input: unknown, now = new Date()): Promise<TimeEntry> {
  const { ticketId, startedAt, endedAt, note } = timeEntrySchema.parse(input);
  if (endedAt <= startedAt) throw new AppError(400, "The end time must be after the start time.");
  if (endedAt.getTime() - startedAt.getTime() > MAX_ENTRY_HOURS * HOUR_MS) throw new AppError(400, `An entry can be at most ${MAX_ENTRY_HOURS} hours long.`);
  if (endedAt.getTime() > now.getTime() + 5 * 60_000) throw new AppError(400, "Time can't be logged in the future.");
  const ticket = await requireTicket(userId, ticketId, "time:log");
  const entry = await db.timeEntry.create({ data: { userId, ticketId, projectId: ticket.projectId, startedAt, endedAt, note }, include });
  return serialize(entry, userId);
}

// People can delete only their own entries.
export async function deleteTimeEntry(userId: string, entryId: string) {
  idSchema.parse(entryId);
  const { count } = await db.timeEntry.deleteMany({ where: { id: entryId, userId } });
  if (!count) throw new AppError(404, "Time entry not found.");
  return { deleted: true };
}
