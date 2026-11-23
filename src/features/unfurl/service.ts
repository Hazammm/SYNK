import { lookup } from "node:dns/promises";
import { db } from "../../lib/db";
import { realtime } from "../../lib/realtime";
import { extractPlainText } from "../../lib/validation";
import { extractHttpUrls, hostnameIsDrive, isPrivateIp, parsePublicHttpUrl } from "../../lib/unfurl-ssrf";
import { parseOpenGraph } from "../../lib/og-parse";
import type { ChatUnfurl } from "../../lib/chat-types";

const FETCH_TIMEOUT_MS = 4_000;
const MAX_HTML_BYTES = 512 * 1024;

export async function assertSafeUnfurlUrl(href: string) {
  const url = parsePublicHttpUrl(href);
  if (!url) throw new Error("blocked");
  const resolved = await lookup(url.hostname, { all: true });
  if (!resolved.length || resolved.some(entry => isPrivateIp(entry.address))) throw new Error("blocked");
  return url;
}

async function fetchPreview(href: string) {
  const url = await assertSafeUnfurlUrl(href);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "User-Agent": "SynkBot/1.0" },
    });
    if (response.status >= 300 && response.status < 400) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HTML_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    const og = parseOpenGraph(html, url.href);
    if (!og.title && !og.description) return null;
    return { url: url.href, ...og };
  } finally {
    clearTimeout(timer);
  }
}

export function urlsToUnfurl(body: string, attachmentNames: string[] = []) {
  const fromDrive = attachmentNames.some(name => /drive|google/i.test(name));
  return extractHttpUrls(extractPlainText(body)).filter(href => {
    const url = parsePublicHttpUrl(href);
    if (!url) return false;
    if (hostnameIsDrive(url.hostname) && fromDrive) return false;
    if (hostnameIsDrive(url.hostname)) return false;
    return true;
  });
}

export async function unfurlMessage(messageId: string) {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, body: true, channelId: true, attachments: { select: { fileName: true } } },
  });
  if (!message) return;
  const urls = urlsToUnfurl(message.body, message.attachments.map(item => item.fileName));
  if (!urls.length) return;
  const previews: ChatUnfurl[] = [];
  for (const href of urls) {
    try {
      const preview = await fetchPreview(href);
      if (!preview) continue;
      await db.messageUnfurl.upsert({
        where: { messageId_url: { messageId, url: preview.url } },
        create: { messageId, url: preview.url, title: preview.title, description: preview.description, imageUrl: preview.imageUrl, siteName: preview.siteName },
        update: { title: preview.title, description: preview.description, imageUrl: preview.imageUrl, siteName: preview.siteName },
      });
      previews.push(preview);
    } catch {
      // Timeouts, DNS failures and private IPs are skipped.
    }
  }
  if (!previews.length) return;
  const row = await db.message.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { id: true, name: true, image: true } },
      reactions: { select: { emoji: true, userId: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, size: true, storageKey: true } },
      pins: { select: { id: true } },
      unfurls: true,
      poll: { include: { options: { include: { votes: { select: { userId: true } } }, orderBy: { position: "asc" } } } },
      _count: { select: { replies: true } },
    },
  });
  if (!row) return;
  const { serializeStoredMessage } = await import("../chat/serialize");
  try {
    await realtime()?.publishMessageUpdated?.({ message: serializeStoredMessage(row) });
  } catch {
    console.error("Unfurl broadcast failed", messageId);
  }
}
