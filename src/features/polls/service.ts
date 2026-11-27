import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel } from "../../lib/permissions";
import { realtime } from "../../lib/realtime";
import { pollSchema, pollVoteSchema } from "../../lib/validation";
import { sendMessage } from "../chat/service";
import { messageInclude, serializePoll, serializeStoredMessage, type StoredMessage } from "../chat/serialize";

export async function createPoll(userId: string, channelId: string, input: unknown) {
  const data = pollSchema.parse(input);
  const labels = [...new Set(data.options.map(option => option.trim()).filter(Boolean))];
  if (labels.length < 2) throw new AppError(400, "Add at least two different options.");
  const body = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: data.question }] }],
  });
  const message = await sendMessage(userId, channelId, { body, clientId: crypto.randomUUID() });
  await db.poll.create({
    data: {
      messageId: message.id,
      question: data.question,
      multiSelect: data.multiSelect,
      options: { create: labels.map((label, position) => ({ label, position })) },
    },
  });
  const row = await db.message.findUniqueOrThrow({ where: { id: message.id }, include: messageInclude });
  const serialized = serializeStoredMessage(row);
  try {
    await realtime()?.publishMessageUpdated?.({ message: serialized });
  } catch {
    console.error("Poll create broadcast failed");
  }
  return serialized;
}

async function loadPoll(pollId: string) {
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: {
      message: { select: { id: true, channelId: true, deletedAt: true } },
      options: { include: { votes: { select: { userId: true } } }, orderBy: { position: "asc" } },
    },
  });
  if (!poll || poll.message.deletedAt) throw new AppError(404, "Poll not found.");
  return poll;
}

export async function votePoll(userId: string, pollId: string, input: unknown) {
  const { optionIds } = pollVoteSchema.parse(input);
  const unique = [...new Set(optionIds)];
  const poll = await db.$transaction(async tx => {
    const existing = await tx.poll.findUnique({
      where: { id: pollId },
      include: { message: { select: { channelId: true, deletedAt: true } }, options: { select: { id: true } } },
    });
    if (!existing || existing.message.deletedAt) throw new AppError(404, "Poll not found.");
    await requireChannel(userId, existing.message.channelId, tx);
    if (existing.closedAt) throw new AppError(400, "This poll is closed.");
    const allowed = new Set(existing.options.map(option => option.id));
    if (unique.some(id => !allowed.has(id))) throw new AppError(400, "Choose options that belong to this poll.");
    if (!existing.multiSelect && unique.length > 1) throw new AppError(400, "This poll allows only one choice.");
    await tx.pollVote.deleteMany({ where: { userId, option: { pollId } } });
    await tx.pollVote.createMany({ data: unique.map(optionId => ({ optionId, userId })) });
    return tx.poll.findUniqueOrThrow({
      where: { id: pollId },
      include: {
        message: { select: { id: true, channelId: true } },
        options: { include: { votes: { select: { userId: true } } }, orderBy: { position: "asc" } },
      },
    });
  });
  const view = serializePoll(poll as StoredMessage["poll"])!;
  try {
    await realtime()?.publishPollUpdated?.(poll.message.channelId, poll.message.id, view);
    const row = await db.message.findUnique({ where: { id: poll.message.id }, include: messageInclude });
    if (row) await realtime()?.publishMessageUpdated?.({ message: serializeStoredMessage(row) });
  } catch {
    console.error("Poll vote broadcast failed");
  }
  return view;
}

export async function closePoll(userId: string, pollId: string) {
  const poll = await loadPoll(pollId);
  await requireChannel(userId, poll.message.channelId);
  const message = await db.message.findUniqueOrThrow({ where: { id: poll.message.id }, select: { authorId: true, channel: { select: { workspaceId: true } } } });
  const member = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: message.channel.workspaceId, userId } } });
  if (message.authorId !== userId && member?.role !== "ADMIN") throw new AppError(403, "Only the poll's author or an admin can close it.");
  const updated = await db.poll.update({
    where: { id: pollId },
    data: { closedAt: new Date() },
    include: {
      message: { select: { id: true, channelId: true } },
      options: { include: { votes: { select: { userId: true } } }, orderBy: { position: "asc" } },
    },
  });
  const view = serializePoll(updated as StoredMessage["poll"])!;
  try {
    await realtime()?.publishPollUpdated?.(updated.message.channelId, updated.message.id, view);
  } catch {
    console.error("Poll close broadcast failed");
  }
  return view;
}
