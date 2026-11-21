import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { realtime } from "../../lib/realtime";
import { avatarUrl, currentStatus, profileFields, statusFields } from "../account/service";
import type { DirectoryPerson } from "../../lib/people-types";

// Everyone in a workspace, for its members only. Phone numbers are shown only to people in the same workspace.
export async function listPeople(viewerId: string, workspaceId: string): Promise<DirectoryPerson[]> {
  await requireWorkspace(viewerId, workspaceId);
  const online = realtime()?.onlineUserIds?.() ?? new Set<string>();
  const rows = await db.membership.findMany({
    where: { workspaceId }, orderBy: { createdAt: "asc" },
    select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true, ...profileFields, ...statusFields } } },
  });
  return rows.map(({ role, createdAt, user }) => ({
    id: user.id, name: user.name, email: user.email, image: avatarUrl(user), role,
    title: user.title, phone: user.phone, location: user.location, timezone: user.timezone, pronouns: user.pronouns,
    status: currentStatus(user), online: online.has(user.id) && !user.away, joinedAt: createdAt.toISOString(),
  }));
}
