import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);
const DRIVE_HOSTS = ["drive.google.com", "docs.google.com", "sheets.google.com", "slides.google.com"];

export function hostnameIsDrive(hostname: string) {
  const host = hostname.toLowerCase();
  return DRIVE_HOSTS.some(item => host === item || host.endsWith(`.${item}`));
}

export function isPrivateIp(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
    return false;
  }
  return true;
}

export function parsePublicHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (isIP(host) && isPrivateIp(host)) return null;
    return url;
  } catch {
    return null;
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractHttpUrls(text: string, limit = 3) {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.match(URL_IN_TEXT) ?? []) {
    const trimmed = match.replace(/[.,;:!?]+$/g, "");
    const url = parsePublicHttpUrl(trimmed);
    if (!url) continue;
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(key);
    if (found.length >= limit) break;
  }
  return found;
}
