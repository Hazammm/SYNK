import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel, requireWorkspace } from "../../lib/permissions";
import { realtime } from "../../lib/realtime";
import { reminderSchema } from "../../lib/validation";
import { extractPlainText } from "../../lib/validation";

export async function createReminder(userId: string, workspaceId: string, input: unknown) {
  const data = reminderSchema.parse(input);
  await requireWorkspace(userId, workspaceId);
  if (data.messageId) {
    const message = await db.message.findUnique({ where: { id: data.messageId }, select: { id: true, channelId: true, workspaceId: true } });
    if (!message || message.workspaceId !== workspaceId) throw new AppError(404, "Message not found.");
    await requireChannel(userId, message.channelId);
  }
  const row = await db.reminder.create({
    data: {
      userId,
      workspaceId,
      messageId: data.messageId ?? null,
      text: data.text,
      dueAt: data.dueAt,
    },
  });
  return serialize(row);
}

export async function listReminders(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId);
  const rows = await db.reminder.findMany({
    where: { userId, workspaceId, cancelledAt: null },
    orderBy: { dueAt: "asc" },
    include: { message: { select: { id: true, channelId: true, body: true, channel: { select: { name: true } } } } },
  });
  return rows.map(row => ({
    id: row.id,
    text: row.text || (row.message ? extractPlainText(row.message.body).slice(0, 140) : "Reminder"),
    dueAt: row.dueAt.toISOString(),
    firedAt: row.firedAt?.toISOString() ?? null,
    messageId: row.messageId,
    channelId: row.message?.channelId ?? null,
    place: row.message?.channel.name ? `#${row.message.channel.name}` : null,
  }));
}

export async function cancelReminder(userId: string, id: string) {
  const row = await db.reminder.findUnique({ where: { id } });
  if (!row || row.userId !== userId) throw new AppError(404, "Reminder not found.");
  if (row.cancelledAt || row.firedAt) throw new AppError(400, "That reminder is no longer waiting.");
  await db.reminder.update({ where: { id }, data: { cancelledAt: new Date() } });
  return { cancelled: true };
}

function serialize(row: { id: string; text: string; dueAt: Date; firedAt: Date | null; messageId: string | null }) {
  return { id: row.id, text: row.text, dueAt: row.dueAt.toISOString(), firedAt: row.firedAt?.toISOString() ?? null, messageId: row.messageId };
}

export async function deliverDueReminders(now = new Date(), limit = 20) {
  const due = await db.reminder.findMany({
    where: { firedAt: null, cancelledAt: null, dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: limit,
    include: { message: { select: { id: true, channelId: true, workspaceId: true, body: true, channel: { select: { name: true } } } } },
  });
  let fired = 0;
  for (const item of due) {
    const claimed = await db.reminder.updateMany({ where: { id: item.id, firedAt: null, cancelledAt: null }, data: { firedAt: now } });
    if (!claimed.count) continue;
    fired += 1;
    const snippet = item.text || (item.message ? extractPlainText(item.message.body).slice(0, 120) : "Reminder");
    const url = item.message
      ? `/w/${item.message.workspaceId}/chat/${item.message.channelId}?message=${item.message.id}`
      : `/w/${item.workspaceId}/alerts`;
    try {
      await realtime()?.notifyUser?.(item.userId, { title: "Reminder", body: snippet, url });
    } catch {
      console.error("Reminder notify failed", item.id);
    }
  }
  return { fired };
}
