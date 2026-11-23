import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireWorkspace } from "../../lib/permissions";
import { imageTypeOf, MAX_AVATAR_BYTES } from "../account/avatar";
import { isValidShortcode, normalizeShortcode, wrapShortcode } from "../../lib/emoji-shortcode";
import { emojiShortcodeSchema } from "../../lib/validation";

const EMOJI_DIR = join(process.cwd(), ".uploads", "emoji");

export function emojiUrl(workspaceId: string, shortcode: string) {
  return `/api/workspaces/${workspaceId}/emoji/${encodeURIComponent(shortcode)}`;
}

export async function listEmoji(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId);
  const rows = await db.customEmoji.findMany({ where: { workspaceId }, orderBy: { shortcode: "asc" } });
  return rows.map(row => ({ shortcode: row.shortcode, reaction: wrapShortcode(row.shortcode), url: emojiUrl(workspaceId, row.shortcode) }));
}

export async function createEmoji(userId: string, workspaceId: string, shortcodeInput: unknown, file: File) {
  await requireWorkspace(userId, workspaceId);
  const shortcode = emojiShortcodeSchema.parse(typeof shortcodeInput === "string" ? shortcodeInput : "");
  if (!isValidShortcode(shortcode)) throw new AppError(400, "Use 2–32 lowercase letters, numbers and hyphens.");
  if (file.size > MAX_AVATAR_BYTES) throw new AppError(400, "Choose an image up to 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = imageTypeOf(bytes);
  if (!kind) throw new AppError(400, "Use a PNG, JPEG, GIF or WebP image.");
  const storageKey = `${workspaceId}-${shortcode}-${randomBytes(6).toString("hex")}.${kind.ext}`;
  await mkdir(EMOJI_DIR, { recursive: true });
  await writeFile(join(EMOJI_DIR, storageKey), bytes);
  try {
    const row = await db.customEmoji.create({
      data: { workspaceId, shortcode, storageKey, mimeType: kind.type, uploadedById: userId },
    });
    return { shortcode: row.shortcode, reaction: wrapShortcode(row.shortcode), url: emojiUrl(workspaceId, row.shortcode) };
  } catch (error) {
    await rm(join(EMOJI_DIR, storageKey), { force: true });
    throw error;
  }
}

export async function removeEmoji(userId: string, workspaceId: string, shortcodeInput: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const shortcode = normalizeShortcode(shortcodeInput);
  const existing = await db.customEmoji.findUnique({ where: { workspaceId_shortcode: { workspaceId, shortcode } } });
  if (!existing) throw new AppError(404, "That emoji is not in this workspace.");
  await db.customEmoji.delete({ where: { id: existing.id } });
  await rm(join(EMOJI_DIR, existing.storageKey), { force: true });
  return { removed: true };
}

export async function readEmoji(userId: string, workspaceId: string, shortcodeInput: string) {
  await requireWorkspace(userId, workspaceId);
  const shortcode = normalizeShortcode(shortcodeInput);
  const row = await db.customEmoji.findUnique({ where: { workspaceId_shortcode: { workspaceId, shortcode } } });
  if (!row) throw new AppError(404, "Emoji not found.");
  const bytes = await readFile(join(EMOJI_DIR, row.storageKey)).catch(() => { throw new AppError(404, "Emoji not found."); });
  return { bytes, type: row.mimeType };
}
