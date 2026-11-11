import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { isoDate } from "../projects/service";
import { dayOf } from "../reports/calc";
import type { Overview } from "../../lib/report-types";

const MAX_MY_TICKETS = 8;
const WEEK_MS = 7 * 86_400_000;

// A personal summary of one workspace. Everything is limited to projects the caller can open,
// so a workspace admin without project access sees no tickets from that project here either.
export async function getOverview(userId: string, workspaceId: string, now = new Date()): Promise<Overview> {
  await requireWorkspace(userId, workspaceId);
  const projects = { workspaceId, access: { some: { userId } } } satisfies Prisma.ProjectWhereInput;
  const mine = { assigneeId: userId, project: projects } satisfies Prisma.TicketWhereInput;
  const open = { ...mine, column: { isDone: false } } satisfies Prisma.TicketWhereInput;
  const today = new Date(`${dayOf(now)}T00:00:00.000Z`);

  const [tickets, assignedOpen, overdue, completedThisWeek, projectCount, sprints] = await Promise.all([
    db.ticket.findMany({
      where: open, take: MAX_MY_TICKETS,
      // Soonest due first, then the most urgent; tickets without a due date come last.
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, key: true, title: true, priority: true, dueDate: true, projectId: true, boardId: true, column: { select: { name: true } } },
    }),
    db.ticket.count({ where: open }),
    db.ticket.count({ where: { ...open, dueDate: { lt: today } } }),
    db.ticket.count({ where: { ...mine, column: { isDone: true }, completedAt: { gte: new Date(now.getTime() - WEEK_MS) } } }),
    db.project.count({ where: projects }),
    db.sprint.findMany({
      where: { state: "ACTIVE", project: projects }, orderBy: [{ endDate: "asc" }, { id: "asc" }],
      select: { id: true, name: true, endDate: true, project: { select: { id: true, name: true } } },
    }),
  ]);

  const sprintIds = sprints.map(sprint => sprint.id);
  const counts = sprintIds.length ? await db.ticket.groupBy({ by: ["sprintId", "columnId"], where: { sprintId: { in: sprintIds } }, _count: { _all: true } }) : [];
  const doneColumns = new Set((await db.boardColumn.findMany({ where: { id: { in: counts.map(row => row.columnId) }, isDone: true }, select: { id: true } })).map(column => column.id));
  const progress = (sprintId: string, onlyDone: boolean) => counts
    .filter(row => row.sprintId === sprintId && (!onlyDone || doneColumns.has(row.columnId)))
    .reduce((sum, row) => sum + row._count._all, 0);

  return {
    stats: { assignedOpen, overdue, completedThisWeek, projects: projectCount },
    tickets: tickets.map(({ column, dueDate, ...ticket }) => ({ ...ticket, status: column.name, dueDate: dueDate ? isoDate(dueDate) : null })),
    sprints: sprints.map(sprint => ({ id: sprint.id, name: sprint.name, endDate: isoDate(sprint.endDate), project: sprint.project, total: progress(sprint.id, false), completed: progress(sprint.id, true) })),
  };
}
