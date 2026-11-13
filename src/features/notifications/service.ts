import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { notificationReadSchema } from "../../lib/validation";
import type { NotificationItem } from "../../lib/ticket-types";

const MAX_LISTED = 100;
const EXCERPT_LENGTH = 140;

// Notifications are filtered by current access: losing a project hides its notifications too.
const visibleTo = (userId: string) => ({
  recipientId: userId,
  ticket: { project: { access: { some: { userId } }, workspace: { memberships: { some: { userId } } } } },
}) satisfies Prisma.NotificationWhereInput;

export async function listNotifications(userId: string): Promise<{ notifications: NotificationItem[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: visibleTo(userId), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_LISTED,
      include: {
        actor: { select: { id: true, name: true } }, comment: { select: { body: true } },
        ticket: { select: { id: true, key: true, title: true, projectId: true, boardId: true, project: { select: { workspaceId: true } } } },
      },
    }),
    db.notification.count({ where: { ...visibleTo(userId), readAt: null } }),
  ]);
  return {
    unread,
    notifications: rows.map(({ ticket: { project, ...ticket }, ...row }) => ({
      id: row.id, type: row.type, createdAt: row.createdAt.toISOString(), read: row.readAt !== null, actor: row.actor,
      ticket: { ...ticket, workspaceId: project.workspaceId },
      excerpt: row.comment ? row.comment.body.slice(0, EXCERPT_LENGTH) + (row.comment.body.length > EXCERPT_LENGTH ? "…" : "") : null,
    })),
  };
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

type Recipient = { recipientId: string; type: "TICKET_ASSIGNED" | "TICKET_COMMENT" | "TICKET_MENTION" };
const PREFERENCE = { TICKET_ASSIGNED: "notifyAssigned", TICKET_COMMENT: "notifyComments", TICKET_MENTION: "notifyMentions" } as const;

// Drops the notifications people have turned off in their settings.
export async function wantedNotifications<Entry extends Recipient>(database: Pick<typeof db, "user">, entries: Entry[]): Promise<Entry[]> {
  if (!entries.length) return entries;
  const people = await database.user.findMany({
    where: { id: { in: [...new Set(entries.map(entry => entry.recipientId))] } },
    select: { id: true, notifyAssigned: true, notifyComments: true, notifyMentions: true },
  });
  const byId = new Map(people.map(person => [person.id, person]));
  return entries.filter(entry => byId.get(entry.recipientId)?.[PREFERENCE[entry.type]] ?? false);
}
