import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { idSchema } from "../../lib/validation";
import { avatarUrl } from "./service";

const AVATAR_DIR = join(process.cwd(), ".uploads", "avatars");
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
// The file's first bytes decide the type, not what the browser claims.
const SIGNATURES: { type: string; ext: string; matches: (bytes: Buffer) => boolean }[] = [
  { type: "image/png", ext: "png", matches: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", ext: "jpg", matches: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", ext: "gif", matches: b => b.subarray(0, 4).toString("ascii") === "GIF8" },
  { type: "image/webp", ext: "webp", matches: b => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];
export const imageTypeOf = (bytes: Buffer) => SIGNATURES.find(signature => signature.matches(bytes));

export async function setAvatar(userId: string, file: File) {
  if (file.size > MAX_AVATAR_BYTES) throw new AppError(400, "Choose a photo up to 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = imageTypeOf(bytes);
  if (!kind) throw new AppError(400, "Use a PNG, JPEG, GIF or WebP image.");
  const previous = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
  const avatarKey = `${userId}-${randomBytes(6).toString("hex")}.${kind.ext}`;
  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(join(AVATAR_DIR, avatarKey), bytes);
  const user = await db.user.update({ where: { id: userId }, data: { avatarKey }, select: { id: true, avatarKey: true, image: true } });
  if (previous.avatarKey) await rm(join(AVATAR_DIR, previous.avatarKey), { force: true });
  return { image: avatarUrl(user) };
}

export async function removeAvatar(userId: string) {
  const previous = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
  const user = await db.user.update({ where: { id: userId }, data: { avatarKey: null }, select: { id: true, avatarKey: true, image: true } });
  if (previous.avatarKey) await rm(join(AVATAR_DIR, previous.avatarKey), { force: true });
  return { image: avatarUrl(user) };
}

// A photo is visible to people who share a workspace with its owner. Anyone else gets "not found".
export async function readAvatar(viewerId: string, userId: string) {
  idSchema.parse(userId);
  const user = await db.user.findFirst({
    where: { id: userId, avatarKey: { not: null }, memberships: { some: { workspace: { memberships: { some: { userId: viewerId } } } } } },
    select: { avatarKey: true },
  });
  if (!user?.avatarKey) throw new AppError(404, "Photo not found.");
  const bytes = await readFile(join(AVATAR_DIR, user.avatarKey)).catch(() => { throw new AppError(404, "Photo not found."); });
  return { bytes, type: imageTypeOf(bytes)?.type ?? "application/octet-stream" };
}
