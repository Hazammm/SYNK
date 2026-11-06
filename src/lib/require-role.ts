import type { WorkspaceRole } from "@prisma/client";
import { AppError } from "./errors";
import { requireWorkspace } from "./permissions";
import { requireUser } from "./session";

export async function requireRole(workspaceId: string, role: WorkspaceRole) {
  const user = await requireUser();
  const membership = await requireWorkspace(user.id, workspaceId);
  if (membership.role !== role) throw new AppError(403, "You do not have permission to manage this workspace.");
  return { user, membership };
}
