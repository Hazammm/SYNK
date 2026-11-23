"use client";

import { wrapShortcode } from "@/lib/emoji-shortcode";
import styles from "./Chat.module.css";

export function CustomEmojiImg({ workspaceId, shortcode, className }: { workspaceId: string; shortcode: string; className?: string }) {
  const code = shortcode.replace(/^:|:$/g, "");
  return <img className={className ?? styles.customEmoji} src={`/api/workspaces/${workspaceId}/emoji/${encodeURIComponent(code)}`} alt={wrapShortcode(code)} title={wrapShortcode(code)} />;
}

export function renderEmojiToken(workspaceId: string, token: string) {
  if (/^:[a-z][a-z0-9-]{0,30}[a-z0-9]:$/.test(token)) {
    return <CustomEmojiImg workspaceId={workspaceId} shortcode={token} />;
  }
  return token;
}
