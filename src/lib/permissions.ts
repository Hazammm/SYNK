import type { Prisma, WorkspaceRole } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { idSchema } from "./validation";

type Database = Prisma.TransactionClient;
export type Action = "workspace:read" | "workspace:manage" | "channel:read" | "channel:write" | "project:read" | "project:write";
export type AccessFacts = { role: WorkspaceRole | null; channelMember?: boolean; projectLevel?: "READ" | "WRITE" | null };

export function can(action: Action, facts: AccessFacts): boolean {
  if (!facts.role) return false;
  switch (action) {
    case "workspace:read": return true;
    case "workspace:manage": return facts.role === "ADMIN";
    case "channel:read":
    case "channel:write": return facts.channelMember === true;
    case "project:read": return facts.projectLevel === "READ" || facts.projectLevel === "WRITE";
    case "project:write": return facts.projectLevel === "WRITE";
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
