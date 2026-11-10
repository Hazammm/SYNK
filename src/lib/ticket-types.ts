// Shapes shared by the issue-tracking API and its client components.
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type ProjectLevel = "READ" | "WRITE";
export type SprintState = "PLANNED" | "ACTIVE" | "COMPLETED";
export type Person = { id: string; name: string | null };

// `level` is null only for workspace admins looking at a project they have not joined.
export type ProjectSummary = { id: string; workspaceId: string; name: string; key: string; level: ProjectLevel | null };
export type ColumnSummary = { id: string; name: string; position: number; isDone: boolean };
export type BoardSummary = { id: string; name: string; columns: ColumnSummary[] };
export type SprintSummary = { id: string; name: string; goal: string; startDate: string; endDate: string; state: SprintState; completedAt: string | null };
export type ProjectMember = Person & { level: ProjectLevel };
export type ProjectDetail = Omit<ProjectSummary, "level"> & { level: ProjectLevel; canManage: boolean; boards: BoardSummary[]; sprints: SprintSummary[]; members: ProjectMember[] };
export type AccessEntry = Person & { email: string | null; role: "ADMIN" | "MEMBER"; level: ProjectLevel | null };

export type TicketSummary = {
  id: string; key: string; projectId: string; boardId: string; columnId: string; sprintId: string | null;
  title: string; priority: Priority; position: number; dueDate: string | null; assignee: Person | null; commentCount: number;
};
export type TicketComment = { id: string; body: string; createdAt: string; author: Person };
export type TicketDetail = TicketSummary & { description: string; reporter: Person | null; createdAt: string; updatedAt: string; comments: TicketComment[] };

export type NotificationType = "TICKET_ASSIGNED" | "TICKET_COMMENT" | "TICKET_MENTION";
export type NotificationItem = {
  id: string; type: NotificationType; createdAt: string; read: boolean; actor: Person | null;
  ticket: { id: string; key: string; title: string; projectId: string; boardId: string; workspaceId: string };
  excerpt: string | null;
};
