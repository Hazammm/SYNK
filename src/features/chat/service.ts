import { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel, requireWorkspace } from "../../lib/permissions";
import { channelSchema, historySchema, messageSchema } from "../../lib/validation";
import { realtime } from "../../lib/realtime";
import type { ChatMessage, MessagePage } from "../../lib/chat-types";

const include = { sender: { select: { id: true, name: true } }, _count: { select: { replies: true } } } satisfies Prisma.MessageInclude;
type Record = Prisma.MessageGetPayload<{ include: typeof include }>;
export function serializeMessage(row: Record): ChatMessage {
  return { id: row.id, channelId: row.channelId, body: row.body, parentId: row.parentId, clientMessageId: row.clientMessageId, createdAt: row.createdAt.toISOString(), sender: row.sender, replyCount: row._count.replies };
}

export async function listChannels(userId: string, workspaceId: string) {
  const member = await requireWorkspace(userId, workspaceId);
  const channels = await db.channel.findMany({
    where: { workspaceId, OR: [{ isPrivate: false }, { members: { some: { userId } } }] },
    include: { members: { where: { userId }, select: { userId: true } }, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });
  return channels.map(({ members, _count, ...channel }) => ({ ...channel, joined: members.length > 0, memberCount: _count.members, canManageMembers: channel.createdById === userId || member.role === "ADMIN" }));
}

export async function createChannel(userId: string, workspaceId: string, input: unknown) {
  const data = channelSchema.parse(input);
  return db.$transaction(async tx => {
    await requireWorkspace(userId, workspaceId, "workspace:read", tx);
    const channel = await tx.channel.create({ data: { ...data, workspaceId, createdById: userId } });
    await tx.channelMember.create({ data: { userId, workspaceId, channelId: channel.id } });
    return channel;
  });
}

export async function joinChannel(userId: string, channelId: string) {
  return db.$transaction(async tx => {
    const channel = await tx.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(403, "Channel unavailable.");
    await requireWorkspace(userId, channel.workspaceId, "workspace:read", tx);
    if (channel.isPrivate) await requireChannel(userId, channelId, tx);
    await tx.channelMember.upsert({ where: { channelId_userId: { channelId, userId } },
      create: { channelId, workspaceId: channel.workspaceId, userId }, update: {} });
    return { joined: true };
  });
}

export async function addChannelMember(actorId: string, channelId: string, userId: string) {
  return db.$transaction(async tx => {
    const channel = await requireChannel(actorId, channelId, tx);
    if (channel.createdById !== actorId) await requireWorkspace(actorId, channel.workspaceId, "workspace:manage", tx);
    await requireWorkspace(userId, channel.workspaceId, "workspace:read", tx);
    await tx.channelMember.upsert({ where: { channelId_userId: { channelId, userId } },
      create: { channelId, workspaceId: channel.workspaceId, userId }, update: {} });
    return { added: true };
  });
}

export async function listMessages(userId: string, channelId: string, input: unknown): Promise<MessagePage> {
  const { cursor, parentId, limit } = historySchema.parse(input);
  await requireChannel(userId, channelId);
  const scope = { channelId, parentId: parentId ?? null };
  if (parentId) {
    const root = await db.message.findFirst({ where: { id: parentId, channelId, parentId: null } });
    if (!root) throw new AppError(404, "Thread not found in this channel.");
  }
  const boundary = cursor ? await db.message.findFirst({ where: { ...scope, id: cursor }, select: { id: true, createdAt: true } }) : null;
  if (cursor && !boundary) throw new AppError(400, "Invalid cursor for this channel or thread.");
  const rows = await db.message.findMany({
    where: { ...scope, ...(boundary && { OR: [{ createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } }] }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, include,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { messages: page.reverse().map(serializeMessage), nextCursor: hasMore ? page[0].id : null };
}

export async function sendMessage(userId: string, channelId: string, input: unknown): Promise<ChatMessage> {
  const data = messageSchema.parse(input);
  const unique = { senderId_channelId_clientMessageId: { senderId: userId, channelId, clientMessageId: data.clientMessageId } };
  const checkRetry = (row: Record) => {
    if (row.body !== data.body || row.parentId !== data.parentId) throw new AppError(409, "This message ID was already used for different content.");
    return row;
  };
  let row: Record;
  try {
    row = await db.$transaction(async tx => {
      await requireChannel(userId, channelId, tx);
      const existing = await tx.message.findUnique({ where: unique, include });
      if (existing) return checkRetry(existing);
      if (data.parentId) {
        const parent = await tx.message.findFirst({ where: { id: data.parentId, channelId, parentId: null } });
        if (!parent) throw new AppError(400, "Reply to a top-level message in this channel.");
      }
      return tx.message.create({ data: { ...data, senderId: userId, channelId }, include });
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    // A concurrent retry may have inserted the same client UUID first.
    await requireChannel(userId, channelId);
    row = checkRetry(await db.message.findUniqueOrThrow({ where: unique, include }));
  }
  const message = serializeMessage(row);
  const parentReplyCount = data.parentId ? await db.message.count({ where: { channelId, parentId: data.parentId } }) : undefined;
  // Persistence is authoritative; failed live delivery must not turn a committed write into an error.
  try { await realtime()?.publish({ message, parentReplyCount }); }
  catch { console.error("Live message delivery failed; history will reconcile on reconnect."); }
  return message;
}
