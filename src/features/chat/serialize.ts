import type { Prisma } from "@prisma/client";
import type { ChatMessage, ChatPoll, ChatReaction, ChatUnfurl } from "../../lib/chat-types";

export const messageInclude = {
  author: { select: { id: true, name: true, image: true } },
  reactions: { select: { emoji: true, userId: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, size: true, storageKey: true } },
  pins: { select: { id: true } },
  unfurls: true,
  poll: { include: { options: { include: { votes: { select: { userId: true } } }, orderBy: { position: "asc" as const } } } },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;

export type StoredMessage = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function formatReactions(reactions: Array<{ emoji: string; userId: string }>): ChatReaction[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const list = map.get(r.emoji) ?? [];
    list.push(r.userId);
    map.set(r.emoji, list);
  }
  return [...map.entries()].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

export function serializePoll(poll: StoredMessage["poll"]): ChatPoll | null {
  if (!poll) return null;
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    closed: poll.closedAt !== null,
    options: poll.options.map(option => ({
      id: option.id,
      label: option.label,
      position: option.position,
      count: option.votes.length,
      userIds: option.votes.map(vote => vote.userId),
    })),
  };
}

export function serializeUnfurls(rows: StoredMessage["unfurls"]): ChatUnfurl[] {
  return (rows ?? []).map(row => ({
    url: row.url,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    siteName: row.siteName,
  }));
}

export function serializeStoredMessage(row: StoredMessage): ChatMessage {
  const isDeleted = !!row.deletedAt;
  const author = { id: row.author.id, name: row.author.name, image: row.author.image };
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    authorId: row.authorId,
    body: isDeleted ? "This message was deleted" : row.body,
    threadRootId: row.threadRootId,
    alsoInChannel: row.alsoInChannel,
    viaApp: row.viaApp || undefined,
    clientId: row.clientId,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    author,
    replyCount: row._count.replies,
    reactions: formatReactions(row.reactions ?? []),
    attachments: isDeleted ? [] : (row.attachments ?? []).map(a => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      storageKey: a.storageKey,
      url: `/api/attachments/${a.id}`,
    })),
    unfurls: isDeleted ? [] : serializeUnfurls(row.unfurls),
    poll: isDeleted ? null : serializePoll(row.poll),
    isPinned: (row.pins?.length ?? 0) > 0,
    senderId: row.authorId,
    sender: author,
    parentId: row.threadRootId,
    clientMessageId: row.clientId,
  };
}
