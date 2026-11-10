import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireProject, requireWorkspace } from "../../lib/permissions";
import { projectAccessSchema, projectSchema } from "../../lib/validation";
import type { AccessEntry, BoardSummary, ProjectDetail, ProjectSummary, SprintSummary } from "../../lib/ticket-types";

type Database = Prisma.TransactionClient;
export const DEFAULT_COLUMNS = [
  { name: "To Do", isDone: false }, { name: "In Progress", isDone: false },
  { name: "Review", isDone: false }, { name: "Done", isDone: true },
];
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const boardInclude = { columns: { orderBy: { position: "asc" } } } satisfies Prisma.BoardInclude;
type BoardRecord = Prisma.BoardGetPayload<{ include: typeof boardInclude }>;
export function serializeBoard(board: BoardRecord): BoardSummary {
  return { id: board.id, name: board.name, columns: board.columns.map(({ id, name, position, isDone }) => ({ id, name, position, isDone })) };
}
export function serializeSprint(sprint: Prisma.SprintGetPayload<object>): SprintSummary {
  return { id: sprint.id, name: sprint.name, goal: sprint.goal, startDate: isoDate(sprint.startDate), endDate: isoDate(sprint.endDate), state: sprint.state, completedAt: sprint.completedAt?.toISOString() ?? null };
}

export function createBoardRecord(database: Database, projectId: string, name: string, columns = DEFAULT_COLUMNS) {
  return database.board.create({
    data: { projectId, name, columns: { create: columns.map((column, position) => ({ ...column, position })) } },
    include: boardInclude,
  });
}

// Members see the projects they can open. Admins also see the rest (level null) so they can grant access.
export async function listProjects(userId: string, workspaceId: string): Promise<ProjectSummary[]> {
  const member = await requireWorkspace(userId, workspaceId);
  const projects = await db.project.findMany({
    where: { workspaceId, ...(member.role !== "ADMIN" && { access: { some: { userId } } }) },
    include: { access: { where: { userId } } }, orderBy: { name: "asc" },
  });
  return projects.map(project => ({ id: project.id, workspaceId, name: project.name, key: project.key, level: project.access[0]?.level ?? null }));
}

export async function createProject(userId: string, workspaceId: string, input: unknown): Promise<ProjectSummary> {
  const data = projectSchema.parse(input);
  return db.$transaction(async tx => {
    await requireWorkspace(userId, workspaceId, "workspace:manage", tx);
    if (await tx.project.findUnique({ where: { workspaceId_key: { workspaceId, key: data.key } } })) {
      throw new AppError(409, `Another project in this workspace already uses the key ${data.key}.`);
    }
    const project = await tx.project.create({ data: { ...data, workspaceId, access: { create: { userId, level: "WRITE" } } } });
    await createBoardRecord(tx, project.id, "Main board");
    return { id: project.id, workspaceId, name: project.name, key: project.key, level: "WRITE" as const };
  });
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDetail> {
  const { project, role, level } = await requireProject(userId, projectId, "project:read");
  const [boards, sprints, access] = await Promise.all([
    db.board.findMany({ where: { projectId }, include: boardInclude, orderBy: { createdAt: "asc" } }),
    db.sprint.findMany({ where: { projectId }, orderBy: [{ startDate: "asc" }, { createdAt: "asc" }] }),
    // Only people who are still workspace members count as project members.
    db.projectAccess.findMany({
      where: { projectId, user: { memberships: { some: { workspaceId: project.workspaceId } } } },
      select: { level: true, user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } },
    }),
  ]);
  return {
    ...project, level: level!, canManage: role === "ADMIN",
    boards: boards.map(serializeBoard), sprints: sprints.map(serializeSprint),
    members: access.map(entry => ({ ...entry.user, level: entry.level })),
  };
}

export async function listProjectAccess(userId: string, projectId: string): Promise<AccessEntry[]> {
  const { project } = await requireProject(userId, projectId, "project:manage");
  const members = await db.membership.findMany({
    where: { workspaceId: project.workspaceId },
    select: { role: true, user: { select: { id: true, name: true, email: true, projectAccess: { where: { projectId } } } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map(({ role, user }) => ({ id: user.id, name: user.name, email: user.email, role, level: user.projectAccess[0]?.level ?? null }));
}

export async function setProjectAccess(actorId: string, projectId: string, input: unknown) {
  const { userId, level } = projectAccessSchema.parse(input);
  return db.$transaction(async tx => {
    const { project } = await requireProject(actorId, projectId, "project:manage", tx);
    // Only current workspace members can hold project access.
    await requireWorkspace(userId, project.workspaceId, "workspace:read", tx).catch(() => {
      throw new AppError(400, "Add this person to the workspace before giving project access.");
    });
    if (level) {
      await tx.projectAccess.upsert({ where: { projectId_userId: { projectId, userId } }, create: { projectId, userId, level }, update: { level } });
    } else {
      await revokeProjectAccess(tx, userId, [projectId]);
    }
    return { userId, level };
  });
}

// Someone who can no longer open a project should not stay assigned to its tickets.
export async function revokeProjectAccess(database: Database, userId: string, projectIds: string[]) {
  await database.projectAccess.deleteMany({ where: { userId, projectId: { in: projectIds } } });
  await database.ticket.updateMany({ where: { assigneeId: userId, projectId: { in: projectIds } }, data: { assigneeId: null } });
}
