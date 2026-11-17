import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db";
import { AppError } from "./errors";
import { requireChannel, requireWorkspace } from "./permissions";
import { idSchema } from "./validation";
import { INLINE_ATTACHMENT_TYPES } from "./chat-types";

const UPLOAD_DIR = join(process.cwd(), ".uploads");

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function saveAttachment(
  userId: string,
  workspaceId: string,
  file: File
): Promise<{ id: string; fileName: string; mimeType: string; size: number; url: string }> {
  await requireWorkspace(userId, workspaceId);

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AppError(400, "File exceeds maximum size limit of 10MB.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(UPLOAD_DIR, { recursive: true });

  const attachment = await db.attachment.create({
    data: {
      uploaderId: userId,
      workspaceId,
      fileName: file.name.slice(0, 150),
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storageKey: "",
    },
  });

  const storageKey = `${attachment.id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = join(UPLOAD_DIR, storageKey);
  await writeFile(filePath, bytes);

  await db.attachment.update({
    where: { id: attachment.id },
    data: { storageKey },
  });

  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: `/api/attachments/${attachment.id}`,
  };
}

// A file posted in a message is readable by the people who can read that channel. One not yet posted (or whose
// message was deleted) is readable only by its uploader. Missing and forbidden look the same.
export async function readAttachment(userId: string, attachmentId: string) {
  idSchema.parse(attachmentId);
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    include: { message: { select: { channelId: true, deletedAt: true } } },
  });
  // A deleted message's files go back to being visible only to their uploader.
  const allowed = attachment && (attachment.message && !attachment.message.deletedAt
    ? await requireChannel(userId, attachment.message.channelId).then(() => true, () => false)
    : attachment.uploaderId === userId && await requireWorkspace(userId, attachment.workspaceId).then(() => true, () => false));
  if (!attachment || !allowed) throw new AppError(404, "Attachment not found.");

  const filePath = join(UPLOAD_DIR, attachment.storageKey);
  const data = await readFile(filePath);
  return { attachment, data };
}

