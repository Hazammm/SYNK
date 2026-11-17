import { db } from "./db";
import { AppError } from "./errors";
import { MAX_ATTACHMENT_SIZE_BYTES, saveAttachment } from "./attachments";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: ".pptx",
  },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: ".png" },
};

type DriveFile = { id: string; name: string; mimeType: string; size: number | null };

type StoredAccount = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

export function googleDriveConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function hasDriveScope(scope: string | null) {
  return (scope ?? "").split(/[\s,]+/).includes(DRIVE_SCOPE);
}

function driveSearchQuery(search: string) {
  const base = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  const cleaned = search.replace(/['\\]/g, "").trim().slice(0, 80);
  return cleaned ? `${base} and name contains '${cleaned}'` : base;
}

function safeFileName(name: string, ext: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 140) || "drive-file";
  if (ext && !cleaned.toLowerCase().endsWith(ext)) return `${cleaned}${ext}`.slice(0, 150);
  return cleaned.slice(0, 150);
}

async function refreshGoogle(account: StoredAccount) {
  if (!account.refresh_token) throw new AppError(409, "Connect Google Drive to attach files from Drive.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const tokens = response?.ok
    ? await response.json().catch(() => null) as { access_token?: string; expires_in?: number; refresh_token?: string } | null
    : null;
  if (!tokens?.access_token) throw new AppError(409, "Connect Google Drive to attach files from Drive.");
  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? account.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
    },
  });
  return tokens.access_token;
}

async function driveAccessToken(userId: string) {
  if (!googleDriveConfigured()) throw new AppError(503, "Google Drive is not configured.");
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true, scope: true },
  });
  if (!account?.access_token || !hasDriveScope(account.scope)) {
    throw new AppError(409, "Connect Google Drive to attach files from Drive.");
  }
  const expired = account.expires_at !== null && account.expires_at * 1000 < Date.now() + 60_000;
  return expired ? refreshGoogle(account) : account.access_token;
}

async function driveResponse(token: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) throw new AppError(502, "Google Drive could not be reached.");
  if (response.ok) return response;
  const body = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
  const reason = body?.error?.errors?.[0]?.reason;
  if (reason === "accessNotConfigured" || reason === "SERVICE_DISABLED") {
    throw new AppError(503, "Enable the Google Drive API for this app, then try again.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new AppError(409, "Connect Google Drive to attach files from Drive.");
  }
  throw new AppError(502, "Google Drive could not be reached.");
}

async function readLimited(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_ATTACHMENT_SIZE_BYTES) throw new AppError(400, "File exceeds maximum size limit of 10MB.");
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "Google Drive did not return a file.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ATTACHMENT_SIZE_BYTES) {
        await reader.cancel();
        throw new AppError(400, "File exceeds maximum size limit of 10MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function listDriveFiles(userId: string, search: string): Promise<DriveFile[]> {
  const token = await driveAccessToken(userId);
  const params = new URLSearchParams({
    pageSize: "20",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,size)",
    q: driveSearchQuery(search),
  });
  const response = await driveResponse(token, `https://www.googleapis.com/drive/v3/files?${params}`);
  const body = await response.json().catch(() => null) as { files?: { id?: string; name?: string; mimeType?: string; size?: string }[] } | null;
  return (body?.files ?? [])
    .filter(file => file.id && file.name)
    .map(file => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType ?? "application/octet-stream",
      size: file.size ? Number(file.size) : null,
    }));
}

export async function importDriveFile(userId: string, workspaceId: string, fileId: string) {
  const token = await driveAccessToken(userId);
  const metaResponse = await driveResponse(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
  );
  const meta = await metaResponse.json().catch(() => null) as { name?: string; mimeType?: string; size?: string } | null;
  if (!meta?.name || !meta.mimeType) throw new AppError(404, "That Drive file could not be found.");
  if (meta.mimeType === "application/vnd.google-apps.folder") throw new AppError(400, "Choose a file, not a folder.");
  if (meta.size && Number(meta.size) > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AppError(400, "File exceeds maximum size limit of 10MB.");
  }

  const exported = EXPORTS[meta.mimeType];
  const downloadUrl = exported
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exported.mime)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const bytes = await readLimited(await driveResponse(token, downloadUrl));
  const mimeType = exported?.mime ?? meta.mimeType;
  const fileName = safeFileName(meta.name, exported?.ext ?? "");
  const file = new File([new Uint8Array(bytes)], fileName, { type: mimeType || "application/octet-stream" });
  return saveAttachment(userId, workspaceId, file);
}
