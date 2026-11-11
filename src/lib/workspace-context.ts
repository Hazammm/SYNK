import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { requirePageUser } from "./session";

export async function resolveActiveWorkspace(userId: string, preferredWorkspaceId?: string | null) {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) {
    return null;
  }
  if (preferredWorkspaceId) {
    const match = memberships.find(m => m.workspaceId === preferredWorkspaceId);
    if (match) return match.workspaceId;
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { lastActiveWorkspaceId: true },
  });
  if (user?.lastActiveWorkspaceId) {
    const match = memberships.find(m => m.workspaceId === user.lastActiveWorkspaceId);
    if (match) return match.workspaceId;
  }
  return memberships[0].workspaceId;
}

export async function requireWorkspaceUser(workspaceId: string) {
  const user = await requirePageUser();
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspace: true },
  });
  if (!membership) {
    notFound();
  }
  if (user.workspaceId !== workspaceId) {
    await db.user.update({
      where: { id: user.id },
      data: { lastActiveWorkspaceId: workspaceId },
    });
  }
  return {
    ...user,
    workspaceId,
    role: membership.role,
    workspaceName: membership.workspace.name,
  };
}
