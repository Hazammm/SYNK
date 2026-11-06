import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { workspaceSchema } from "../../lib/validation";
import { AppError } from "../../lib/errors";
import { realtime } from "../../lib/realtime";

export async function listWorkspaces(userId: string) {
  const memberships = await db.membership.findMany({ where: { userId }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  return memberships.map(({ role, workspace }) => ({ id: workspace.id, name: workspace.name, role }));
}

export async function createWorkspace(userId: string, input: unknown) {
  const data = workspaceSchema.parse(input);
  return db.$transaction(async tx => {
    const workspace = await tx.workspace.create({ data: { ...data, createdById: userId } });
    await tx.membership.create({ data: { workspaceId: workspace.id, userId, role: "ADMIN" } });
    const channel = await tx.channel.create({ data: { workspaceId: workspace.id, createdById: userId, name: "general", description: "Updates and conversations for everyone." } });
    await tx.channelMember.create({ data: { workspaceId: workspace.id, channelId: channel.id, userId } });
    return { ...workspace, role: "ADMIN" as const };
  });
}

export async function listMembers(actorId: string, workspaceId: string) {
  await requireWorkspace(actorId, workspaceId);
  return db.membership.findMany({ where: { workspaceId }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
}

export async function removeMember(actorId: string, workspaceId: string, userId: string) {
  await db.$transaction(async tx => {
    await requireWorkspace(actorId, workspaceId, "workspace:manage", tx);
    if (actorId === userId) throw new AppError(400, "Admins cannot remove themselves from the workspace.");
    const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!target) throw new AppError(404, "Workspace member not found.");
    await tx.membership.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    await tx.projectAccess.deleteMany({ where: { userId, project: { workspaceId } } });
  });
  realtime()?.revokeUser(userId);
  return { removed: true };
}
