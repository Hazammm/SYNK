// Shapes shared by the sprint report and overview APIs and their client components.
import type { Person, Priority, SprintState } from "./ticket-types";

export type BurndownPoint = { date: string; ideal: number; remaining: number | null };
export type ReportSprint = { id: string; name: string; state: SprintState; startDate: string; endDate: string };
export type ReportTicket = { id: string; key: string; title: string; status: string; done: boolean; priority: Priority; assignee: Person | null; completedAt: string | null };
export type SprintReport = {
  sprint: ReportSprint & { goal: string };
  // `total` includes tickets carried over to the backlog when the sprint was completed.
  totals: { total: number; completed: number; remaining: number; carriedOver: number };
  byStatus: { name: string; done: boolean; count: number }[];
  byAssignee: { assignee: Person | null; total: number; completed: number }[];
  burndown: BurndownPoint[];
  tickets: ReportTicket[];
};
export type VelocityEntry = { id: string; name: string; completed: number; carriedOver: number };
// `report` is null when the project has no sprints yet.
export type ProjectReport = { sprints: ReportSprint[]; report: SprintReport | null; velocity: VelocityEntry[] };

export type OverviewTicket = {
  id: string; key: string; title: string; status: string; priority: Priority; dueDate: string | null;
  projectId: string; boardId: string;
};
export type OverviewSprint = { id: string; name: string; endDate: string; project: { id: string; name: string }; total: number; completed: number };
export type Overview = {
  stats: { assignedOpen: number; overdue: number; completedThisWeek: number; projects: number };
  tickets: OverviewTicket[];
  sprints: OverviewSprint[];
};
