import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel } from "../../lib/permissions";
import { scheduledMessageSchema } from "../../lib/validation";
import { sendMessage } from "../chat/service";

export async function scheduleMessage(userId: string, channelId: string, input: unknown) {
  const data = scheduledMessageSchema.parse(input);
  const clientId = data.clientId ?? data.clientMessageId ?? crypto.randomUUID();
  const channel = await requireChannel(userId, channelId);
  const row = await db.scheduledMessage.create({
    data: {
      workspaceId: channel.workspaceId,
      channelId,
      authorId: userId,
      body: data.body,
      threadRootId: data.threadRootId ?? data.parentId ?? null,
      alsoInChannel: Boolean(data.alsoInChannel),
      clientId,
      attachmentIds: data.attachmentIds ?? [],
      sendAt: data.sendAt,
    },
  });
  return {
    id: row.id,
    channelId: row.channelId,
    sendAt: row.sendAt.toISOString(),
    status: row.status,
  };
}

export async function listScheduled(userId: string, workspaceId: string) {
  const rows = await db.scheduledMessage.findMany({
    where: { authorId: userId, workspaceId, status: "PENDING" },
    orderBy: { sendAt: "asc" },
    select: { id: true, channelId: true, sendAt: true, status: true, body: true, channel: { select: { name: true } } },
  });
  return rows.map(row => ({
    id: row.id,
    channelId: row.channelId,
    place: row.channel.name ? `#${row.channel.name}` : "a conversation",
    sendAt: row.sendAt.toISOString(),
    status: row.status,
  }));
}

export async function cancelScheduled(userId: string, id: string) {
  const row = await db.scheduledMessage.findUnique({ where: { id } });
  if (!row || row.authorId !== userId) throw new AppError(404, "Scheduled message not found.");
  if (row.status !== "PENDING") throw new AppError(400, "That message is no longer waiting to send.");
  await db.scheduledMessage.update({ where: { id }, data: { status: "CANCELLED" } });
  return { cancelled: true };
}

export async function deliverDueScheduled(now = new Date(), limit = 20) {
  const due = await db.scheduledMessage.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: limit,
  });
  const delivered: string[] = [];
  for (const item of due) {
    const claimed = await db.scheduledMessage.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "SENT" },
    });
    if (!claimed.count) continue;
    try {
      const message = await sendMessage(item.authorId, item.channelId, {
        body: item.body,
        clientId: item.clientId,
        threadRootId: item.threadRootId,
        alsoInChannel: item.alsoInChannel,
        attachmentIds: item.attachmentIds,
      });
      await db.scheduledMessage.update({ where: { id: item.id }, data: { sentMessageId: message.id } });
      delivered.push(item.id);
    } catch (error) {
      await db.scheduledMessage.update({ where: { id: item.id }, data: { status: "PENDING" } });
      console.error("Scheduled message failed", item.id, error instanceof Error ? error.message : error);
    }
  }
  return { delivered: delivered.length };
}
