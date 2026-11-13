import type { Prisma, WorkspaceRole } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { idSchema } from "./validation";

type Database = Prisma.TransactionClient;
export type ProjectAction = "project:read" | "project:write" | "project:manage" | "ticket:read" | "ticket:write" | "ticket:comment" | "ticket:delete" | "board:manage" | "sprint:manage" | "doc:read" | "doc:write";
export type Action = "workspace:read" | "workspace:manage" | "channel:read" | "channel:write" | ProjectAction;
export type AccessFacts = { role: WorkspaceRole | null; channelMember?: boolean; projectLevel?: "READ" | "WRITE" | null };

// The single answer to "can this user perform this action on this resource?".
// Human requests and (later) AI tool calls both go through here.
export function can(action: Action, facts: AccessFacts): boolean {
  if (!facts.role) return false;
  switch (action) {
    case "workspace:read": return true;
    case "workspace:manage":
    // Creating projects and granting project access is a workspace admin task.
    case "project:manage": return facts.role === "ADMIN";
    case "channel:read":
    case "channel:write": return facts.channelMember === true;
    case "project:read":
    case "ticket:read":
    case "doc:read": return facts.projectLevel === "READ" || facts.projectLevel === "WRITE";
    case "project:write":
    case "ticket:write":
    case "ticket:comment":
    case "ticket:delete":
    case "board:manage":
    case "sprint:manage":
    case "doc:write": return facts.projectLevel === "WRITE";
    default: return false;
  }
}

export async function requireWorkspace(userId: string, workspaceId: string, action: "workspace:read" | "workspace:manage" = "workspace:read", database: Database = db) {
  idSchema.parse(workspaceId);
  const member = await database.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!can(action, { role: member?.role ?? null })) throw new AppError(403, "You do not have access to this workspace action.");
  return member!;
}

export async function requireChannel(userId: string, channelId: string, database: Database = db) {
  idSchema.parse(channelId);
  const channelMember = await database.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } }, include: { channel: true, membership: true },
  });
  if (!can("channel:read", { role: channelMember?.membership.role ?? null, channelMember: !!channelMember })) {
    throw new AppError(403, "Join this channel before accessing its messages.");
  }
  return channelMember!.channel;
}

// Workspace membership and project access are both required: a removed workspace
// member must lose project access even if an old ProjectAccess row survives.
export async function requireProject(userId: string, projectId: string, action: ProjectAction = "project:read", database: Database = db) {
  idSchema.parse(projectId);
  const project = await database.project.findUnique({
    where: { id: projectId },
    include: { access: { where: { userId } }, workspace: { select: { memberships: { where: { userId } } } } },
  });
  const role = project?.workspace.memberships[0]?.role ?? null;
  const level = project?.access[0]?.level ?? null;
  if (!project || !can(action, { role, projectLevel: level })) throw new AppError(403, "You do not have access to this project action.");
  return { project: { id: project.id, workspaceId: project.workspaceId, name: project.name, key: project.key }, role: role!, level };
}
