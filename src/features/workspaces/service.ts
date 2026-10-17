import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { emailSchema, workspaceSchema } from "../../lib/validation";
import { AppError } from "../../lib/errors";
import { realtime } from "../../lib/realtime";

export async function listWorkspaces(userId: string) {
  const memberships = await db.membership.findMany({ where: { userId }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  return memberships.map(({ role, workspace }) => ({ id: workspace.id, name: workspace.name, role }));
}

export async function createWorkspace(userId: string, input: unknown) {
  const data = workspaceSchema.parse(input);
  return db.$transaction(async tx => {
    const workspace = await tx.workspace.create({ data: { ...data, memberships: { create: { userId, role: "ADMIN" } } } });
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
    await tx.membership.upsert({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, create: { workspaceId, userId: user.id }, update: {} });
    return { added: true };
  });
}

export async function removeMember(actorId: string, workspaceId: string, userId: string) {
  await db.$transaction(async tx => {
    await requireWorkspace(actorId, workspaceId, "workspace:manage", tx);
    const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (target?.role === "ADMIN") throw new AppError(400, "Admin removal is not supported here.");
    await tx.membership.deleteMany({ where: { workspaceId, userId, role: "MEMBER" } });
  });
  realtime()?.revokeUser(userId);
  return { removed: true };
}
