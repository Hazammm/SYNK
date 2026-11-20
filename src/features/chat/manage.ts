import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel, requireWorkspace } from "../../lib/permissions";
import { realtime } from "../../lib/realtime";
import { extractPlainText, idSchema } from "../../lib/validation";
import type { SavedItem, ThreadSummary } from "../../lib/chat-types";
import { getChannel } from "./service";

const channelName = z.string().trim().toLowerCase().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.");
export const channelSettingsSchema = z.object({
  name: channelName.optional(),
  archived: z.boolean().optional(),
  // One way only: a private channel cannot be made public again, because its history was private.
  private: z.literal(true).optional(),
  postingPolicy: z.enum(["EVERYONE", "ADMINS"]).optional(),
}).strict().refine(update => Object.values(update).some(value => value !== undefined), "Nothing to update.");

// The channel's creator and workspace admins manage a channel. Direct messages have no settings.
async function requireManager(userId: string, channelId: string) {
  idSchema.parse(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.type === "DM" || channel.type === "GROUP_DM") throw new AppError(404, "Channel not found.");
  const member = await requireWorkspace(userId, channel.workspaceId);
  const inChannel = await db.channelMember.findUnique({ where: { channelId_userId: { channelId, userId } } });
  if (channel.type === "PRIVATE" && !inChannel) throw new AppError(404, "Channel not found.");
  if (channel.createdById !== userId && member.role !== "ADMIN") throw new AppError(403, "Only the channel's creator or a workspace admin can change this.");
  return channel;
}

export async function updateChannelSettings(userId: string, channelId: string, input: unknown) {
  const update = channelSettingsSchema.parse(input);
  const channel = await requireManager(userId, channelId);
  if (channel.isDefault && (update.archived || update.private)) throw new AppError(400, "The default channel can't be archived or made private, because everyone belongs to it.");
  if (update.private && channel.type !== "PUBLIC") throw new AppError(400, "This channel is already private.");
  try {
    await db.channel.update({
      where: { id: channelId },
      data: {
        ...(update.name !== undefined && { name: update.name }),
        ...(update.archived !== undefined && { archivedAt: update.archived ? new Date() : null }),
        ...(update.private && { type: "PRIVATE", isPrivate: true }),
        ...(update.postingPolicy !== undefined && { postingPolicy: update.postingPolicy }),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError(409, "A channel with that name already exists.");
    throw error;
  }
  const summary = await getChannel(userId, channelId);
  await realtime()?.publishChannelUpdated?.(channel.workspaceId, summary).catch(() => undefined);
  return summary;
}

// Removes someone from a channel. Nobody can be removed from the default channel; leaving is for oneself.
export async function removeChannelMember(actorId: string, channelId: string, userId: string) {
  idSchema.parse(userId);
  const channel = await requireManager(actorId, channelId);
  if (channel.isDefault) throw new AppError(400, "People can't be removed from the default channel.");
  if (actorId === userId) throw new AppError(400, "Use Leave channel to leave it yourself.");
  const { count } = await db.channelMember.deleteMany({ where: { channelId, userId } });
  if (!count) throw new AppError(404, "That person is not in this channel.");
  realtime()?.revokeUser(userId);
  return { removed: true };
}

export async function setChannelMuted(userId: string, channelId: string, muted: unknown) {
  const value = z.boolean().parse(muted);
  await requireChannel(userId, channelId);
  await db.channelMember.update({ where: { channelId_userId: { channelId, userId } }, data: { muted: value } });
  return { muted: value };
}
