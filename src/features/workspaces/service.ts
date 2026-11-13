import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { emailSchema, workspaceSchema } from "../../lib/validation";
import { AppError } from "../../lib/errors";
import { realtime } from "../../lib/realtime";
import { createBoardRecord, revokeProjectAccess } from "../projects/service";

export async function listWorkspaces(userId: string) {
  const memberships = await db.membership.findMany({ where: { userId }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  return memberships.map(({ role, workspace }) => ({ id: workspace.id, name: workspace.name, role }));
}

export async function createWorkspace(userId: string, input: unknown) {
  const data = workspaceSchema.parse(input);
  return db.$transaction(async tx => {
    const workspace = await tx.workspace.create({ data: { ...data, createdById: userId } });
    await tx.membership.create({ data: { workspaceId: workspace.id, userId, role: "ADMIN" } });
    await tx.user.update({ where: { id: userId }, data: { lastActiveWorkspaceId: workspace.id } });
    const project = await tx.project.create({ data: { workspaceId: workspace.id, name: "General", key: "GEN" } });
    await tx.projectAccess.create({ data: { projectId: project.id, userId, level: "WRITE" } });
    await createBoardRecord(tx, project.id, "Main board");
    const channel = await tx.channel.create({ data: { workspaceId: workspace.id, createdById: userId, name: "general", description: "Updates and conversations for everyone." } });
    await tx.channelMember.create({ data: { workspaceId: workspace.id, channelId: channel.id, userId } });
    return { ...workspace, role: "ADMIN" as const };
  });
}

export async function listMembers(actorId: string, workspaceId: string) {
  await requireWorkspace(actorId, workspaceId);
  return db.membership.findMany({ where: { workspaceId }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
}

export async function addMember(actorId: string, workspaceId: string, email: unknown) {
  const address = emailSchema.parse(email);
  return db.$transaction(async tx => {
    await requireWorkspace(actorId, workspaceId, "workspace:manage", tx);
    const user = await tx.user.findUnique({ where: { email: address } });
    if (!user) throw new AppError(404, "Ask your teammate to register with this email first.");
    await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      create: { workspaceId, userId: user.id },
      update: {},
    });
    return { added: true };
  });
}

export async function removeMember(actorId: string, workspaceId: string, userId: string) {
  await db.$transaction(async tx => {
    await requireWorkspace(actorId, workspaceId, "workspace:manage", tx);
    if (actorId === userId) throw new AppError(400, "Admins cannot remove themselves from the workspace.");
    const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!target) throw new AppError(404, "Workspace member not found.");
    if (target?.role === "ADMIN") throw new AppError(400, "Admin removal is not supported here.");
    await tx.membership.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    // Leaving the workspace also ends project access and ticket assignments inside it.
    const projects = await tx.project.findMany({ where: { workspaceId }, select: { id: true } });
    await revokeProjectAccess(tx, userId, projects.map(project => project.id));
  });
  realtime()?.revokeUser(userId);
  return { removed: true };
}
