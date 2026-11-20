import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { realtime } from "../../lib/realtime";
import { extractPlainText, notificationReadSchema } from "../../lib/validation";
import type { NotificationItem, NotificationType } from "../../lib/ticket-types";

const MAX_LISTED = 100;
const EXCERPT_LENGTH = 140;
type Database = Pick<typeof db, "user" | "notification" | "channelMember">;

const excerpt = (text: string) => text.slice(0, EXCERPT_LENGTH) + (text.length > EXCERPT_LENGTH ? "…" : "");

// Notifications are filtered by current access: losing a project or leaving a channel hides its notifications too.
const visibleTo = (userId: string) => ({
  recipientId: userId,
  OR: [
    { ticket: { project: { access: { some: { userId } }, workspace: { memberships: { some: { userId } } } } } },
    { message: { deletedAt: null, channel: { members: { some: { userId } } } } },
  ],
}) satisfies Prisma.NotificationWhereInput;

const include = {
  actor: { select: { id: true, name: true } }, comment: { select: { body: true } },
  ticket: { select: { id: true, key: true, title: true, projectId: true, boardId: true, project: { select: { workspaceId: true } } } },
  message: { select: { id: true, body: true, channelId: true, workspaceId: true, threadRootId: true, channel: { select: { name: true, type: true } } } },
} satisfies Prisma.NotificationInclude;
type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

function serialize(row: Row): NotificationItem {
  const { ticket, message } = row;
  return {
    id: row.id, type: row.type, createdAt: row.createdAt.toISOString(), read: row.readAt !== null, actor: row.actor,
    ticket: ticket && { id: ticket.id, key: ticket.key, title: ticket.title, projectId: ticket.projectId, boardId: ticket.boardId, workspaceId: ticket.project.workspaceId },
    message: message && {
      id: message.id, channelId: message.channelId, workspaceId: message.workspaceId, threadRootId: message.threadRootId,
      channelName: message.channel.name, direct: message.channel.type === "DM" || message.channel.type === "GROUP_DM",
    },
    excerpt: row.comment ? excerpt(row.comment.body) : message ? excerpt(extractPlainText(message.body)) : null,
  };
}

export async function listNotifications(userId: string): Promise<{ notifications: NotificationItem[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: visibleTo(userId), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_LISTED, include }),
    countUnread(userId),
  ]);
  return { unread, notifications: rows.map(serialize) };
}

export async function countUnread(userId: string) {
  return db.notification.count({ where: { ...visibleTo(userId), readAt: null } });
}

// Without `ids`, everything is marked read. Scoping by recipient means other people's IDs are simply ignored.
export async function markNotificationsRead(userId: string, input: unknown) {
  const { ids } = notificationReadSchema.parse(input);
  const { count } = await db.notification.updateMany({ where: { recipientId: userId, readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
  return { updated: count };
}

type Recipient = { recipientId: string; type: NotificationType };
const PREFERENCE = {
  TICKET_ASSIGNED: "notifyAssigned", TICKET_COMMENT: "notifyComments", TICKET_MENTION: "notifyMentions",
  CHAT_MENTION: "notifyMentions", CHAT_REPLY: "notifyReplies", CHAT_REACTION: "notifyReactions",
} as const;

// Drops the notifications people have turned off in their settings.
export async function wantedNotifications<Entry extends Recipient>(database: Pick<typeof db, "user">, entries: Entry[]): Promise<Entry[]> {
  if (!entries.length) return entries;
  const people = await database.user.findMany({
    where: { id: { in: [...new Set(entries.map(entry => entry.recipientId))] } },
    select: { id: true, notifyAssigned: true, notifyComments: true, notifyMentions: true, notifyReplies: true, notifyReactions: true },
  });
  const byId = new Map(people.map(person => [person.id, person]));
  return entries.filter(entry => byId.get(entry.recipientId)?.[PREFERENCE[entry.type]] ?? false);
}

export type ChatNotification = { recipientId: string; actorId: string; messageId: string; type: "CHAT_MENTION" | "CHAT_REPLY" | "CHAT_REACTION" };

// Stores chat alerts for the people who want them. A muted channel only alerts on direct mentions.
export async function createChatNotifications(database: Database, channelId: string, entries: ChatNotification[]): Promise<string[]> {
  const unique = [...new Map(entries.filter(entry => entry.recipientId !== entry.actorId).map(entry => [`${entry.recipientId}:${entry.type}`, entry])).values()];
  if (!unique.length) return [];
  const muted = new Set((await database.channelMember.findMany({
    where: { channelId, muted: true, userId: { in: unique.map(entry => entry.recipientId) } }, select: { userId: true },
  })).map(row => row.userId));
  const wanted = await wantedNotifications(database, unique.filter(entry => entry.type === "CHAT_MENTION" || !muted.has(entry.recipientId)));
  if (!wanted.length) return [];
  const rows = await database.notification.createManyAndReturn({ data: wanted, select: { id: true } });
  return rows.map(row => row.id);
}

export type Announcement = { title: string; body: string; url: string };

function announcementOf(item: NotificationItem): Announcement {
  const who = item.actor?.name ?? "Someone";
  if (item.ticket) {
    const verb = { TICKET_ASSIGNED: "assigned you", TICKET_MENTION: "mentioned you on", TICKET_COMMENT: "commented on" }[item.type as "TICKET_ASSIGNED"] ?? "updated";
    return {
      title: `${who} ${verb} ${item.ticket.key}`, body: item.excerpt ?? item.ticket.title,
      url: `/w/${item.ticket.workspaceId}/board?projectId=${item.ticket.projectId}&boardId=${item.ticket.boardId}&ticket=${item.ticket.id}`,
    };
  }
  const message = item.message!;
  const where = message.direct ? "a direct message" : `#${message.channelName}`;
  const verb = item.type === "CHAT_REPLY" ? `replied to a thread in ${where}` : item.type === "CHAT_REACTION" ? `reacted to your message in ${where}` : message.direct ? "sent you a message" : `mentioned you in ${where}`;
  return { title: `${who} ${verb}`, body: item.excerpt ?? "", url: `/w/${message.workspaceId}/chat/${message.channelId}?message=${message.id}` };
}

// Tells the recipients' open tabs about new alerts, after the change is saved. Paused people get the alert
// in their list, but no pop-up.
export async function announceNotifications(ids: string[]) {
  const live = realtime();
  if (!live?.notifyUser || !ids.length) return;
  const rows = await db.notification.findMany({ where: { id: { in: ids } }, include: { ...include, recipient: { select: { notificationsPausedUntil: true } } } });
  const now = Date.now();
  await Promise.allSettled(rows.map(row => {
    const paused = (row.recipient.notificationsPausedUntil?.getTime() ?? 0) > now;
    return live.notifyUser!(row.recipientId, paused ? null : announcementOf(serialize(row)));
  }));
}
