import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireProject } from "../../lib/permissions";
import { reportQuerySchema } from "../../lib/validation";
import { isoDate } from "../projects/service";
import { burndown, dayOf } from "./calc";
import type { ProjectReport, ReportSprint, SprintReport, VelocityEntry } from "../../lib/report-types";

const MAX_REPORT_TICKETS = 500;
const VELOCITY_SPRINTS = 6;
type SprintRecord = Prisma.SprintGetPayload<object>;
const summarize = (sprint: SprintRecord): ReportSprint => ({ id: sprint.id, name: sprint.name, state: sprint.state, startDate: isoDate(sprint.startDate), endDate: isoDate(sprint.endDate) });

// Sprint review (PRD journey 8): anyone who can read the project can read its reports.
export async function getProjectReport(userId: string, projectId: string, input: unknown, now = new Date()): Promise<ProjectReport> {
  const { sprintId } = reportQuerySchema.parse(input);
  await requireProject(userId, projectId, "project:read");
  const sprints = await db.sprint.findMany({ where: { projectId }, orderBy: [{ startDate: "asc" }, { createdAt: "asc" }] });
  const completed = sprints.filter(sprint => sprint.state === "COMPLETED").sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());
  // Without a choice, show the sprint people are working on, then the latest finished one.
  const selected = sprintId ? sprints.find(sprint => sprint.id === sprintId)
    : sprints.find(sprint => sprint.state === "ACTIVE") ?? completed.at(-1) ?? sprints[0];
  if (sprintId && !selected) throw new AppError(404, "Sprint not found.");
  return {
    sprints: sprints.map(summarize),
    report: selected ? await sprintReport(selected, now) : null,
    velocity: await velocity(completed.slice(-VELOCITY_SPRINTS)),
  };
}

async function sprintReport(sprint: SprintRecord, now: Date): Promise<SprintReport> {
  const rows = await db.ticket.findMany({
    where: { sprintId: sprint.id },
    include: { column: { select: { id: true, name: true, isDone: true, position: true } }, assignee: { select: { id: true, name: true } } },
    orderBy: [{ column: { position: "asc" } }, { position: "asc" }, { id: "asc" }], take: MAX_REPORT_TICKETS,
  });
  const done = rows.filter(row => row.column.isDone);
  const carriedOver = sprint.carriedOver ?? 0;
  const total = rows.length + carriedOver;

  const statuses = new Map<string, { name: string; done: boolean; count: number }>();
  const people = new Map<string, SprintReport["byAssignee"][number]>();
  for (const row of rows) {
    const status = statuses.get(row.column.id) ?? { name: row.column.name, done: row.column.isDone, count: 0 };
    statuses.set(row.column.id, { ...status, count: status.count + 1 });
    const person = people.get(row.assigneeId ?? "") ?? { assignee: row.assignee, total: 0, completed: 0 };
    people.set(row.assigneeId ?? "", { ...person, total: person.total + 1, completed: person.completed + (row.column.isDone ? 1 : 0) });
  }

  return {
    sprint: { ...summarize(sprint), goal: sprint.goal },
    totals: { total, completed: done.length, remaining: total - done.length, carriedOver },
    byStatus: [...statuses.values()],
    byAssignee: [...people.values()].sort((a, b) => b.total - a.total || (a.assignee?.name ?? "").localeCompare(b.assignee?.name ?? "")),
    burndown: burndown({
      startDate: isoDate(sprint.startDate), endDate: isoDate(sprint.endDate), total, today: dayOf(now),
      completedDays: done.map(row => dayOf(row.completedAt ?? row.updatedAt)),
    }),
    tickets: rows.map(row => ({
      id: row.id, key: row.key, title: row.title, status: row.column.name, done: row.column.isDone, priority: row.priority,
      assignee: row.assignee, completedAt: row.column.isDone ? (row.completedAt ?? row.updatedAt).toISOString() : null,
    })),
  };
}

// Tickets finished per completed sprint, oldest first.
async function velocity(sprints: SprintRecord[]): Promise<VelocityEntry[]> {
  if (!sprints.length) return [];
  const counts = await db.ticket.groupBy({ by: ["sprintId"], where: { sprintId: { in: sprints.map(sprint => sprint.id) }, column: { isDone: true } }, _count: { _all: true } });
  const bySprint = new Map(counts.map(row => [row.sprintId, row._count._all]));
  return sprints.map(sprint => ({ id: sprint.id, name: sprint.name, completed: bySprint.get(sprint.id) ?? 0, carriedOver: sprint.carriedOver ?? 0 }));
}
