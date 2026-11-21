import { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel, requireWorkspace } from "../../lib/permissions";
import { channelSchema, dmChannelSchema, extractPlainText, historySchema, messageEditSchema, messageSchema, reactionSchema } from "../../lib/validation";
import { realtime } from "../../lib/realtime";
import type { ChannelSummary, ChatMessage, ChatReaction, MessagePage } from "../../lib/chat-types";
import { announceNotifications, createChatNotifications, type ChatNotification } from "../notifications/service";

type Database = Prisma.TransactionClient;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The people a message mentions. Names can contain spaces ("@Demo Admin"), so each member's name is matched
// in full, longest first, rather than taking the first word after the @.
export function mentionedIn(text: string, members: { id: string; name: string | null }[]) {
  const ids = new Set<string>();
  let rest = text;
  for (const member of members.filter(item => item.name?.trim()).sort((a, b) => b.name!.length - a.name!.length)) {
    const pattern = new RegExp(`(^|[^\\w@])@${escapeRegExp(member.name!.trim())}(?!\\w)`, "gi");
    if (pattern.test(rest)) { ids.add(member.id); rest = rest.replace(pattern, "$1"); }
  }
  return { userIds: [...ids], channel: /(^|[^\w@])@channel\b/i.test(rest), here: /(^|[^\w@])@here\b/i.test(rest) };
}

// Announcement-only channels take new posts from workspace admins and the channel's creator; anyone can reply in threads.
async function assertCanPost(tx: Database, userId: string, channel: { workspaceId: string; createdById: string; postingPolicy: string; archivedAt: Date | null }, isReply: boolean) {
  if (channel.archivedAt) throw new AppError(400, "This channel is archived, so new messages can't be posted.");
  if (channel.postingPolicy !== "ADMINS" || isReply || channel.createdById === userId) return;
  const member = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: channel.workspaceId, userId } }, select: { role: true } });
  if (member?.role !== "ADMIN") throw new AppError(403, "Only admins can post in this channel. You can still reply in threads.");
}

const include = {
  author: { select: { id: true, name: true, image: true } },
  reactions: { select: { emoji: true, userId: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, size: true, storageKey: true } },
  pins: { select: { id: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;

type Record = Prisma.MessageGetPayload<{ include: typeof include }>;

function formatReactions(reactions: Array<{ emoji: string; userId: string }>): ChatReaction[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const list = map.get(r.emoji) ?? [];
    list.push(r.userId);
    map.set(r.emoji, list);
  }
  return [...map.entries()].map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

function serializeMessage(row: Record): ChatMessage {
  const isDeleted = !!row.deletedAt;
  const author = { id: row.author.id, name: row.author.name, image: row.author.image };
  const reactions = formatReactions(row.reactions ?? []);
  const attachments = (row.attachments ?? []).map(a => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    storageKey: a.storageKey,
    url: `/api/attachments/${a.id}`,
  }));
  const isPinned = (row.pins?.length ?? 0) > 0;

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    authorId: row.authorId,
    body: isDeleted ? "This message was deleted" : row.body,
    threadRootId: row.threadRootId,
    alsoInChannel: row.alsoInChannel,
    clientId: row.clientId,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    author,
    replyCount: row._count.replies,
    reactions,
    attachments: isDeleted ? [] : attachments,
    isPinned,

    // Aliases
    senderId: row.authorId,
    sender: author,
    parentId: row.threadRootId,
    clientMessageId: row.clientId,
  };
}

export async function listChannels(userId: string, workspaceId: string): Promise<ChannelSummary[]> {
  const member = await requireWorkspace(userId, workspaceId);
  const channels = await db.channel.findMany({
    // Archived channels stay listed for their members, read-only, so they can be found and unarchived.
    where: {
      workspaceId,
      OR: [
        { type: "PUBLIC", archivedAt: null },
        { members: { some: { userId } } },
      ],
    },
    include: {
      members: {
        select: {
          userId: true,
          lastReadAt: true,
          muted: true,
          role: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return Promise.all(channels.map(async channel => {
    const userMembership = channel.members.find(m => m.userId === userId);
    const joined = !!userMembership;
    const lastReadAt = userMembership?.lastReadAt;

    let unreadCount = 0;
    let mentionCount = 0;

    if (joined) {
      const unreadWhere: Prisma.MessageWhereInput = {
        channelId: channel.id,
        deletedAt: null,
        threadRootId: null,
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      };

      unreadCount = await db.message.count({ where: unreadWhere });

      mentionCount = await db.mention.count({
        where: {
          message: unreadWhere,
          OR: [
            { mentionedUserId: userId },
            { kind: "CHANNEL" },
            { kind: "HERE" },
          ],
        },
      });
    }

    let otherUser: ChannelSummary["otherUser"] | undefined;
    if (channel.type === "DM" || channel.type === "GROUP_DM") {
      const other = channel.members.find(m => m.userId !== userId)?.user;
      if (other) {
        otherUser = { id: other.id, name: other.name, image: other.image };
      }
    }

    return {
      id: channel.id,
      workspaceId: channel.workspaceId,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      description: channel.description,
      isDefault: channel.isDefault,
      isPrivate: channel.type !== "PUBLIC",
      joined,
      memberCount: channel._count.members,
      canManageMembers: channel.createdById === userId || member.role === "ADMIN",
      unreadCount,
      mentionCount,
      otherUser,
      muted: userMembership?.muted ?? false,
      archived: channel.archivedAt !== null,
      postingPolicy: channel.postingPolicy,
      canPost: !channel.archivedAt && (channel.postingPolicy === "EVERYONE" || channel.createdById === userId || member.role === "ADMIN"),
    };
  }));
}

export async function createChannel(userId: string, workspaceId: string, input: unknown): Promise<ChannelSummary> {
  const data = channelSchema.parse(input);
  const type = data.type ?? (data.isPrivate ? "PRIVATE" : "PUBLIC");

  return db.$transaction(async tx => {
    await requireWorkspace(userId, workspaceId, "workspace:read", tx);

    const channel = await tx.channel.create({
      data: {
        workspaceId,
        createdById: userId,
        name: data.name ?? null,
        type,
        topic: data.topic ?? "",
        description: data.description ?? "",
        isPrivate: type !== "PUBLIC",
      },
    });

    await tx.channelMember.create({
      data: {
        userId,
        workspaceId,
        channelId: channel.id,
        role: "OWNER",
        lastReadAt: new Date(),
      },
    });

    return {
      id: channel.id,
      workspaceId: channel.workspaceId,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      description: channel.description,
      isDefault: channel.isDefault,
      isPrivate: channel.isPrivate,
      joined: true,
      memberCount: 1,
      canManageMembers: true,
      unreadCount: 0,
      mentionCount: 0,
    };
  });
}

export async function createDirectMessage(userId: string, workspaceId: string, input: unknown): Promise<ChannelSummary> {
  const { userIds } = dmChannelSchema.parse(input);
  const allUserIds = [...new Set([userId, ...userIds])];

  await requireWorkspace(userId, workspaceId);
  for (const uid of userIds) {
    await requireWorkspace(uid, workspaceId);
  }

  // If 1-on-1 DM, check if one already exists
  if (allUserIds.length === 2) {
    const existing = await db.channel.findFirst({
      where: {
        workspaceId,
        type: "DM",
        AND: [
          { members: { some: { userId: allUserIds[0] } } },
          { members: { some: { userId: allUserIds[1] } } },
        ],
      },
      include: {
        members: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
        _count: { select: { members: true } },
      },
    });

    if (existing && existing._count.members === 2) {
      const other = existing.members.find(m => m.userId !== userId)?.user;
      return {
        id: existing.id,
        workspaceId: existing.workspaceId,
        name: null,
        type: "DM",
        topic: existing.topic,
        description: existing.description,
        isDefault: false,
        isPrivate: true,
        joined: true,
        memberCount: 2,
        canManageMembers: false,
        unreadCount: 0,
        mentionCount: 0,
        otherUser: other ? { id: other.id, name: other.name, image: other.image } : undefined,
      };
    }
  }

  const type = allUserIds.length === 2 ? "DM" : "GROUP_DM";

  return db.$transaction(async tx => {
    const channel = await tx.channel.create({
      data: {
        workspaceId,
        createdById: userId,
        type,
        isPrivate: true,
      },
    });

    await tx.channelMember.createMany({
      data: allUserIds.map(uid => ({
        channelId: channel.id,
        workspaceId,
        userId: uid,
        role: uid === userId ? "OWNER" : "MEMBER",
        lastReadAt: new Date(),
      })),
    });

    const otherUserRecord = type === "DM"
      ? await tx.user.findUnique({ where: { id: userIds[0] }, select: { id: true, name: true, image: true } })
      : null;

    return {
      id: channel.id,
      workspaceId: channel.workspaceId,
      name: null,
      type: channel.type,
      topic: "",
      description: "",
      isDefault: false,
      isPrivate: true,
      joined: true,
      memberCount: allUserIds.length,
      canManageMembers: false,
      unreadCount: 0,
      mentionCount: 0,
      otherUser: otherUserRecord ? { id: otherUserRecord.id, name: otherUserRecord.name, image: otherUserRecord.image } : undefined,
    };
  });
}

export async function joinChannel(userId: string, channelId: string) {
  return db.$transaction(async tx => {
    const channel = await tx.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(403, "Channel unavailable.");
    await requireWorkspace(userId, channel.workspaceId, "workspace:read", tx);
    if (channel.isPrivate) await requireChannel(userId, channelId, tx);

    await tx.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, workspaceId: channel.workspaceId, userId, role: "MEMBER", lastReadAt: new Date() },
      update: {},
    });
    return { joined: true };
  });
}

export async function addChannelMember(actorId: string, channelId: string, userId: string) {
  return db.$transaction(async tx => {
    const channel = await requireChannel(actorId, channelId, tx);
    if (channel.createdById !== actorId) await requireWorkspace(actorId, channel.workspaceId, "workspace:manage", tx);
    await requireWorkspace(userId, channel.workspaceId, "workspace:read", tx);
    await tx.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, workspaceId: channel.workspaceId, userId, role: "MEMBER", lastReadAt: new Date() },
      update: {},
    });
    return { added: true };
  });
}

export async function leaveChannel(userId: string, channelId: string) {
  return db.$transaction(async tx => {
    const channel = await tx.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, "Channel not found.");
    if (channel.isDefault) throw new AppError(400, "Cannot leave default channel.");

    await tx.channelMember.deleteMany({
      where: { channelId, userId },
    });
    return { left: true };
  });
}

export async function markChannelRead(userId: string, channelId: string) {
  const readAt = new Date();
  await db.channelMember.updateMany({
    where: { channelId, userId },
    data: { lastReadAt: readAt },
  });
  return { lastReadAt: readAt.toISOString() };
}

export async function listMessages(userId: string, channelId: string, input: unknown): Promise<MessagePage> {
  const { cursor, parentId, threadRootId, limit } = historySchema.parse(input);
  const targetParent = threadRootId ?? parentId ?? null;
  await requireChannel(userId, channelId);

  // The main feed also shows thread replies that were sent to the channel too.
  const scope: Prisma.MessageWhereInput = targetParent
    ? { channelId, threadRootId: targetParent }
    : { channelId, OR: [{ threadRootId: null }, { alsoInChannel: true }] };

  if (targetParent) {
    const root = await db.message.findFirst({ where: { id: targetParent, channelId, threadRootId: null } });
    if (!root) throw new AppError(404, "Thread not found in this channel.");
  }

  const boundary = cursor
    ? await db.message.findFirst({ where: { ...scope, id: cursor }, select: { id: true, createdAt: true } })
    : null;

  if (cursor && !boundary) throw new AppError(400, "Invalid cursor for this channel or thread.");

  const rows = await db.message.findMany({
    where: {
      AND: [scope, ...(boundary ? [{
        OR: [
          { createdAt: { lt: boundary.createdAt } },
          { createdAt: boundary.createdAt, id: { lt: boundary.id } },
        ],
      }] : [])],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const saved = new Set((await db.savedMessage.findMany({ where: { userId, messageId: { in: page.map(row => row.id) } }, select: { messageId: true } })).map(row => row.messageId));
  return { messages: page.reverse().map(row => ({ ...serializeMessage(row), saved: saved.has(row.id) })), nextCursor: hasMore ? page[0].id : null };
}

export async function sendMessage(userId: string, channelId: string, input: unknown): Promise<ChatMessage> {
  const data = messageSchema.parse(input);
  const clientId = data.clientId ?? data.clientMessageId ?? crypto.randomUUID();
  const threadRootId = data.threadRootId ?? data.parentId ?? null;
  const unique = { authorId_clientId: { authorId: userId, clientId } };

  const checkRetry = (row: Record) => {
    if (row.body !== data.body || row.threadRootId !== threadRootId) {
      throw new AppError(409, "This message ID was already used for different content.");
    }
    return row;
  };

  let row: Record;
  let workspaceId = "";
  let alerts: string[] = [];

  try {
    const result = await db.$transaction(async tx => {
      const channel = await requireChannel(userId, channelId, tx);
      workspaceId = channel.workspaceId;

      const existing = await tx.message.findUnique({ where: unique, include });
      if (existing) return { row: checkRetry(existing), workspaceId };

      if (threadRootId) {
        const parent = await tx.message.findFirst({ where: { id: threadRootId, channelId, threadRootId: null } });
        if (!parent) throw new AppError(400, "Reply to a top-level message in this channel.");
      }
      await assertCanPost(tx, userId, channel, Boolean(threadRootId));

      const created = await tx.message.create({
        data: {
          body: data.body,
          workspaceId: channel.workspaceId,
          channelId,
          authorId: userId,
          threadRootId,
          alsoInChannel: Boolean(threadRootId && data.alsoInChannel),
          clientId,
        },
        include,
      });

      // Link attachments if provided
      if (data.attachmentIds && data.attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: data.attachmentIds }, uploaderId: userId, workspaceId: channel.workspaceId },
          data: { messageId: created.id },
        });
      }

      // Mentions (@Full Name, @channel, @here) count only for people in this channel.
      const channelMembers = await tx.channelMember.findMany({ where: { channelId }, select: { userId: true, muted: true, user: { select: { name: true } } } });
      const mentioned = mentionedIn(extractPlainText(data.body), channelMembers.map(item => ({ id: item.userId, name: item.user.name })));
      await tx.mention.createMany({
        data: [
          ...mentioned.userIds.map(mentionedUserId => ({ messageId: created.id, mentionedUserId, kind: "USER" as const })),
          ...(mentioned.channel ? [{ messageId: created.id, kind: "CHANNEL" as const }] : []),
          ...(mentioned.here ? [{ messageId: created.id, kind: "HERE" as const }] : []),
        ],
      });
      const notify: ChatNotification[] = [];
      const add = (recipientId: string, type: ChatNotification["type"]) => notify.push({ recipientId, type, actorId: userId, messageId: created.id });
      mentioned.userIds.forEach(id => add(id, "CHAT_MENTION"));
      // Every message in a direct message, and @channel or @here, alerts everyone else who has not muted it.
      const direct = channel.type === "DM" || channel.type === "GROUP_DM";
      if (direct || mentioned.channel || mentioned.here) channelMembers.filter(item => !item.muted).forEach(item => add(item.userId, "CHAT_MENTION"));
      if (threadRootId) {
        // The thread's author and everyone who already replied hear about new replies.
        const people = await tx.message.findMany({ where: { OR: [{ id: threadRootId }, { threadRootId }] }, select: { authorId: true }, distinct: ["authorId"] });
        people.forEach(item => { if (!notify.some(entry => entry.recipientId === item.authorId)) add(item.authorId, "CHAT_REPLY"); });
      }
      alerts = await createChatNotifications(tx, channelId, notify);

      // Auto update sender lastReadAt
      await tx.channelMember.updateMany({
        where: { channelId, userId },
        data: { lastReadAt: new Date() },
      });

      return { row: created, workspaceId };
    });

    row = result.row;
    workspaceId = result.workspaceId;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const channel = await requireChannel(userId, channelId);
    workspaceId = channel.workspaceId;
    row = checkRetry(await db.message.findUniqueOrThrow({ where: unique, include }));
  }

  const message = serializeMessage(row);
  const parentReplyCount = threadRootId
    ? await db.message.count({ where: { channelId, threadRootId } })
    : undefined;

  try {
    await realtime()?.publish({ message, parentReplyCount });
    await announceNotifications(alerts);
  } catch {
    console.error("Live message delivery failed; history will reconcile on reconnect.");
  }

  return message;
}

export async function editMessage(userId: string, messageId: string, input: unknown): Promise<ChatMessage> {
  const { body } = messageEditSchema.parse(input);

  const row = await db.$transaction(async tx => {
    const existing = await tx.message.findUnique({
      where: { id: messageId },
      include,
    });

    if (!existing) throw new AppError(404, "Message not found.");
    await requireChannel(userId, existing.channelId, tx);
    if (existing.authorId !== userId) throw new AppError(403, "You can only edit your own messages.");
    if (existing.deletedAt) throw new AppError(400, "Cannot edit deleted message.");

    return tx.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      include,
    });
  });

  const message = serializeMessage(row);
  try {
    await realtime()?.publishMessageUpdated?.({ message });
  } catch {
    console.error("Failed to broadcast message edit");
  }
  return message;
}

// Authors delete their own messages; workspace admins may delete any message in a channel they can read.
export async function deleteMessage(userId: string, messageId: string): Promise<{ id: string; channelId: string }> {
  const deleted = await db.$transaction(async tx => {
    const existing = await tx.message.findUnique({
      where: { id: messageId },
      include: { channel: { select: { workspaceId: true } } },
    });

    if (!existing) throw new AppError(404, "Message not found.");
    await requireChannel(userId, existing.channelId, tx);
    const member = await requireWorkspace(userId, existing.channel.workspaceId, "workspace:read", tx);

    const isAuthor = existing.authorId === userId;
    const isAdmin = member.role === "ADMIN";

    if (!isAuthor && !isAdmin) {
      throw new AppError(403, "You do not have permission to delete this message.");
    }

    await tx.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "This message was deleted" },
    });
    return { id: existing.id, channelId: existing.channelId };
  });

  try {
    await realtime()?.publishMessageDeleted?.({ messageId: deleted.id, channelId: deleted.channelId });
  } catch {
    console.error("Failed to broadcast message delete");
  }
  return deleted;
}

export async function toggleReaction(userId: string, messageId: string, input: unknown) {
  const { emoji } = reactionSchema.parse(input);
  let alerts: string[] = [];

  const result = await db.$transaction(async tx => {
    const message = await tx.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError(404, "Message not found.");
    await requireChannel(userId, message.channelId, tx);

    const existing = await tx.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    if (existing) {
      await tx.reaction.delete({ where: { id: existing.id } });
    } else {
      await tx.reaction.create({ data: { messageId, userId, emoji } });
      // Adding a reaction (not removing one) tells the message author.
      alerts = await createChatNotifications(tx, message.channelId, [{ recipientId: message.authorId, actorId: userId, messageId, type: "CHAT_REACTION" }]);
    }

    const updatedReactions = await tx.reaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });

    const formatted = formatReactions(updatedReactions);
    try {
      await realtime()?.publishReactionUpdated?.({
        messageId,
        channelId: message.channelId,
        reactions: formatted,
      });
    } catch {
      console.error("Failed to broadcast reaction update");
    }

    return {
      messageId,
      channelId: message.channelId,
      emoji,
      reactions: formatted,
    };
  });

  await announceNotifications(alerts).catch(() => console.error("Live alert delivery failed."));
  return result;
}

export async function togglePin(userId: string, messageId: string) {
  return db.$transaction(async tx => {
    const message = await tx.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError(404, "Message not found.");
    await requireChannel(userId, message.channelId, tx);

    const existing = await tx.pin.findUnique({
      where: { channelId_messageId: { channelId: message.channelId, messageId } },
    });

    let pinned = false;
    if (existing) {
      await tx.pin.delete({ where: { id: existing.id } });
    } else {
      await tx.pin.create({ data: { channelId: message.channelId, messageId, pinnedById: userId } });
      pinned = true;
    }

    return { messageId, channelId: message.channelId, pinned };
  });
}

export async function listPins(userId: string, channelId: string): Promise<ChatMessage[]> {
  await requireChannel(userId, channelId);
  const pins = await db.pin.findMany({
    where: { channelId },
    include: { message: { include } },
    orderBy: { createdAt: "desc" },
  });

  return pins.map(p => serializeMessage(p.message));
}

export async function updateChannelTopic(userId: string, channelId: string, topic: string): Promise<ChannelSummary> {
  await requireChannel(userId, channelId);
  const updated = await db.channel.update({
    where: { id: channelId },
    data: { topic: topic.trim().slice(0, 250) },
    include: {
      members: {
        select: {
          userId: true,
          lastReadAt: true,
          role: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });

  const userMembership = updated.members.find(m => m.userId === userId);
  const summary: ChannelSummary = {
    id: updated.id,
    workspaceId: updated.workspaceId,
    name: updated.name,
    type: updated.type,
    topic: updated.topic,
    description: updated.description,
    isDefault: updated.isDefault,
    isPrivate: updated.type !== "PUBLIC",
    joined: !!userMembership,
    memberCount: updated._count.members,
    canManageMembers: updated.createdById === userId,
  };

  try {
    await realtime()?.publishChannelUpdated?.(updated.workspaceId, summary);
  } catch {
    // ignore
  }

  return summary;
}

export async function getChannel(userId: string, channelId: string): Promise<ChannelSummary> {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    include: {
      members: {
        select: {
          userId: true,
          lastReadAt: true,
          role: true,
          muted: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });

  if (!channel) throw new AppError(404, "Channel not found.");
  const member = await requireWorkspace(userId, channel.workspaceId);
  const manager = channel.createdById === userId || member.role === "ADMIN";

  const userMembership = channel.members.find(m => m.userId === userId);
  const joined = !!userMembership;
  // Private channels and direct messages look missing to everyone outside them.
  if (channel.type !== "PUBLIC" && !joined) throw new AppError(404, "Channel not found.");

  let otherUser: ChannelSummary["otherUser"] | undefined;
  if (channel.type === "DM" || channel.type === "GROUP_DM") {
    const other = channel.members.find(m => m.userId !== userId)?.user;
    if (other) {
      otherUser = { id: other.id, name: other.name, image: other.image };
    }
  }

  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    type: channel.type,
    topic: channel.topic,
    description: channel.description,
    isDefault: channel.isDefault,
    isPrivate: channel.type !== "PUBLIC",
    joined,
    memberCount: channel._count.members,
    canManageMembers: manager,
    otherUser,
    muted: userMembership?.muted ?? false,
    archived: Boolean(channel.archivedAt),
    postingPolicy: channel.postingPolicy,
    canPost: !channel.archivedAt && (channel.postingPolicy === "EVERYONE" || manager),
  };
}
