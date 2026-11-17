const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function googleDriveConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function hasDriveScope(scope: string | null) {
  return (scope ?? "").split(/[\s,]+/).includes(DRIVE_SCOPE);
}

export function driveSearchQuery(search: string) {
  const base = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  const cleaned = search.replace(/['\\]/g, "").trim().slice(0, 80);
  return cleaned ? `${base} and name contains '${cleaned}'` : base;
}

export function safeDriveFileName(name: string, ext: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 140) || "drive-file";
  if (ext && !cleaned.toLowerCase().endsWith(ext)) return `${cleaned}${ext}`.slice(0, 150);
  return cleaned.slice(0, 150);
}