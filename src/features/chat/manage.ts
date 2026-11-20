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

// Marks a message and everything after it as unread for this person.
export async function markUnread(userId: string, messageId: string) {
  idSchema.parse(messageId);
  const message = await db.message.findUnique({ where: { id: messageId }, select: { channelId: true, createdAt: true } });
  if (!message) throw new AppError(404, "Message not found.");
  await requireChannel(userId, message.channelId);
  const lastReadAt = new Date(message.createdAt.getTime() - 1);
  await db.channelMember.update({ where: { channelId_userId: { channelId: message.channelId, userId } }, data: { lastReadAt } });
  return { channelId: message.channelId, lastReadAt: lastReadAt.toISOString() };
}

// "Save for later": toggles a bookmark on a message this person can read.
export async function toggleSaved(userId: string, messageId: string) {
  idSchema.parse(messageId);
  const message = await db.message.findUnique({ where: { id: messageId }, select: { channelId: true, deletedAt: true } });
  if (!message || message.deletedAt) throw new AppError(404, "Message not found.");
  await requireChannel(userId, message.channelId);
  const { count } = await db.savedMessage.deleteMany({ where: { userId, messageId } });
  if (!count) await db.savedMessage.create({ data: { userId, messageId } });
  return { saved: count === 0 };
}

const author = { select: { id: true, name: true, image: true } } as const;
const snippet = (body: string) => extractPlainText(body).slice(0, 200);
const placeOf = (channel: { name: string | null; type: string }) => channel.type === "DM" || channel.type === "GROUP_DM" ? "Direct message" : `#${channel.name}`;

// Saved messages in one workspace, newest saved first, still limited to channels the person can read.
export async function listSaved(userId: string, workspaceId: string): Promise<SavedItem[]> {
  await requireWorkspace(userId, workspaceId);
  const rows = await db.savedMessage.findMany({
    where: { userId, message: { workspaceId, deletedAt: null, channel: { members: { some: { userId } } } } },
    orderBy: { createdAt: "desc" }, take: 200,
    include: { message: { select: { id: true, body: true, channelId: true, threadRootId: true, createdAt: true, author, channel: { select: { name: true, type: true } } } } },
  });
  return rows.map(({ message, createdAt }) => ({
    messageId: message.id, channelId: message.channelId, threadRootId: message.threadRootId, place: placeOf(message.channel),
    author: message.author, snippet: snippet(message.body), sentAt: message.createdAt.toISOString(), savedAt: createdAt.toISOString(),
  }));
}

// The Threads inbox: threads this person started or replied in, most recently active first.
export async function listThreads(userId: string, workspaceId: string): Promise<ThreadSummary[]> {
  await requireWorkspace(userId, workspaceId);
  const roots = await db.message.findMany({
    where: {
      workspaceId, threadRootId: null, deletedAt: null, replies: { some: {} },
      channel: { members: { some: { userId } } },
      OR: [{ authorId: userId }, { replies: { some: { authorId: userId } } }],
    },
    take: 50,
    select: {
      id: true, body: true, channelId: true, createdAt: true, author, channel: { select: { name: true, type: true } },
      replies: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, author } },
      _count: { select: { replies: true } },
    },
  });
  return roots
    .map(root => ({
      rootId: root.id, channelId: root.channelId, place: placeOf(root.channel), author: root.author, snippet: snippet(root.body),
      replyCount: root._count.replies, lastReply: { author: root.replies[0].author, snippet: snippet(root.replies[0].body), at: root.replies[0].createdAt.toISOString() },
    }))
    .sort((a, b) => b.lastReply.at.localeCompare(a.lastReply.at));
}

// The people in a channel, for its members.
export async function listChannelMembers(userId: string, channelId: string) {
  await requireChannel(userId, channelId);
  const rows = await db.channelMember.findMany({
    where: { channelId }, orderBy: { joinedAt: "asc" },
    select: { membership: { select: { role: true } }, user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map(row => ({ role: row.membership.role, user: row.user }));
}
