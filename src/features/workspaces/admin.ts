import { z } from "zod";
import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { extractPlainText } from "../../lib/validation";
import { parseEmailDomains } from "../../lib/join-policy";

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  invitePolicy: z.enum(["ADMINS", "EVERYONE"]).optional(),
  allowedEmailDomains: z.array(z.string()).max(20).optional(),
  requireGoogleSignIn: z.boolean().optional(),
}).strict().refine(update => Object.values(update).some(value => value !== undefined), "Nothing to update.");

const settingsSelect = { id: true, name: true, invitePolicy: true, allowedEmailDomains: true, requireGoogleSignIn: true } as const;

// Every member can read the name and who may invite; only admins change them.
export async function getWorkspaceSettings(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId);
  return db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: settingsSelect });
}

export async function updateWorkspaceSettings(userId: string, workspaceId: string, input: unknown) {
  const update = workspaceSettingsSchema.parse(input);
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const data = {
    ...(update.name !== undefined && { name: update.name }),
    ...(update.invitePolicy !== undefined && { invitePolicy: update.invitePolicy }),
    ...(update.allowedEmailDomains !== undefined && { allowedEmailDomains: parseEmailDomains(update.allowedEmailDomains) }),
    ...(update.requireGoogleSignIn !== undefined && { requireGoogleSignIn: update.requireGoogleSignIn }),
  };
  return db.workspace.update({ where: { id: workspaceId }, data, select: settingsSelect });
}

const DAY = 24 * 60 * 60 * 1000;

// Usage for admins: people, activity and tickets over the last week and month.
export async function workspaceAnalytics(userId: string, workspaceId: string, now = new Date()) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const weekAgo = new Date(now.getTime() - 7 * DAY), monthAgo = new Date(now.getTime() - 30 * DAY), fortnightAgo = new Date(now.getTime() - 13 * DAY);
  fortnightAgo.setUTCHours(0, 0, 0, 0);
  const live = { workspaceId, deletedAt: null };
  const [members, newMembers, channels, messagesWeek, messagesMonth, activeWeek, activeMonth, ticketsCreated, ticketsDone, recent] = await Promise.all([
    db.membership.count({ where: { workspaceId } }),
    db.membership.count({ where: { workspaceId, createdAt: { gte: monthAgo } } }),
    db.channel.count({ where: { workspaceId, type: { in: ["PUBLIC", "PRIVATE"] }, archivedAt: null } }),
    db.message.count({ where: { ...live, createdAt: { gte: weekAgo } } }),
    db.message.count({ where: { ...live, createdAt: { gte: monthAgo } } }),
    db.message.groupBy({ by: ["authorId"], where: { ...live, createdAt: { gte: weekAgo } } }),
    db.message.groupBy({ by: ["authorId"], where: { ...live, createdAt: { gte: monthAgo } } }),
    db.ticket.count({ where: { project: { workspaceId }, createdAt: { gte: monthAgo } } }),
    db.ticket.count({ where: { project: { workspaceId }, completedAt: { gte: monthAgo } } }),
    db.message.findMany({ where: { ...live, createdAt: { gte: fortnightAgo } }, select: { createdAt: true } }),
  ]);
  // Messages per day for the last 14 days, oldest first, so a chart can be drawn.
  const daily = Array.from({ length: 14 }, (_, index) => ({ date: new Date(fortnightAgo.getTime() + index * DAY).toISOString().slice(0, 10), messages: 0 }));
  for (const { createdAt } of recent) {
    const day = daily.find(item => item.date === createdAt.toISOString().slice(0, 10));
    if (day) day.messages += 1;
  }
  return {
    members, newMembers, channels,
    messages: { week: messagesWeek, month: messagesMonth },
    activeMembers: { week: activeWeek.length, month: activeMonth.length },
    tickets: { created: ticketsCreated, completed: ticketsDone },
    daily,
  };
}

const EXPORT_LIMIT = 50_000;

// A JSON export for admins: members, public channels and their messages, projects and tickets.
// Private channels and direct messages are left out, as in Slack's standard export.
export async function exportWorkspace(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const [workspace, members, channels, messages, projects] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { id: true, name: true, createdAt: true } }),
    db.membership.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true, title: true } } } }),
    db.channel.findMany({ where: { workspaceId, type: "PUBLIC" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, description: true, topic: true, archivedAt: true, createdAt: true } }),
    db.message.findMany({
      where: { workspaceId, deletedAt: null, channel: { type: "PUBLIC" } }, orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT,
      select: { id: true, channelId: true, threadRootId: true, body: true, createdAt: true, editedAt: true, author: { select: { id: true, name: true } } },
    }),
    db.project.findMany({
      where: { workspaceId }, orderBy: { createdAt: "asc" },
      select: { id: true, key: true, name: true, tickets: { orderBy: { createdAt: "asc" }, select: { key: true, title: true, description: true, priority: true, createdAt: true, completedAt: true, column: { select: { name: true } }, assignee: { select: { name: true } } } } },
    }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    workspace,
    members: members.map(member => ({ ...member.user, role: member.role, joinedAt: member.createdAt })),
    channels,
    messages: messages.map(({ body, ...message }) => ({ ...message, text: extractPlainText(body) })),
    truncated: messages.length === EXPORT_LIMIT,
    projects: projects.map(project => ({ ...project, tickets: project.tickets.map(({ column, assignee, ...ticket }) => ({ ...ticket, status: column.name, assignee: assignee?.name ?? null })) })),
  };
}
