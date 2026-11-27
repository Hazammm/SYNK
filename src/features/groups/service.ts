import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireWorkspace } from "../../lib/permissions";
import { idSchema, userGroupSchema, userGroupUpdateSchema } from "../../lib/validation";

const include = { members: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } } } as const;

function serialize(row: { id: string; name: string; handle: string; members: Array<{ userId: string; user: { id: string; name: string | null; email: string | null } }> }) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    mention: `@${row.handle}`,
    members: row.members.map(member => member.user),
  };
}

export async function listGroups(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId);
  const rows = await db.userGroup.findMany({ where: { workspaceId }, include, orderBy: { handle: "asc" } });
  return rows.map(serialize);
}

export async function createGroup(userId: string, workspaceId: string, input: unknown) {
  const data = userGroupSchema.parse(input);
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const members = await db.membership.findMany({
    where: { workspaceId, userId: { in: data.userIds } },
    select: { userId: true },
  });
  if (members.length !== data.userIds.length) throw new AppError(400, "Every member of a group must already belong to this workspace.");
  const row = await db.userGroup.create({
    data: {
      workspaceId,
      name: data.name,
      handle: data.handle,
      createdById: userId,
      members: { create: members.map(member => ({ userId: member.userId })) },
    },
    include,
  });
  return serialize(row);
}

export async function updateGroup(userId: string, workspaceId: string, groupId: string, input: unknown) {
  idSchema.parse(groupId);
  const data = userGroupUpdateSchema.parse(input);
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const existing = await db.userGroup.findFirst({ where: { id: groupId, workspaceId } });
  if (!existing) throw new AppError(404, "Group not found.");
  let memberIds: string[] | undefined;
  if (data.userIds) {
    const members = await db.membership.findMany({
      where: { workspaceId, userId: { in: data.userIds } },
      select: { userId: true },
    });
    if (members.length !== data.userIds.length) throw new AppError(400, "Every member of a group must already belong to this workspace.");
    memberIds = members.map(member => member.userId);
  }
  const row = await db.$transaction(async tx => {
    if (memberIds) {
      await tx.userGroupMember.deleteMany({ where: { groupId } });
      if (memberIds.length) {
        await tx.userGroupMember.createMany({ data: memberIds.map(id => ({ groupId, userId: id })) });
      }
    }
    return tx.userGroup.update({
      where: { id: groupId },
      data: { ...(data.name !== undefined && { name: data.name }) },
      include,
    });
  });
  return serialize(row);
}

export async function deleteGroup(userId: string, workspaceId: string, groupId: string) {
  idSchema.parse(groupId);
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const result = await db.userGroup.deleteMany({ where: { id: groupId, workspaceId } });
  if (!result.count) throw new AppError(404, "Group not found.");
  return { removed: true };
}
