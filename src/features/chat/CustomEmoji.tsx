"use client";

import { wrapShortcode } from "@/lib/emoji-shortcode";
import styles from "./Chat.module.css";

export function CustomEmojiImg({ workspaceId, shortcode, className }: { workspaceId: string; shortcode: string; className?: string }) {
  const code = shortcode.replace(/^:|:$/g, "");
  // Emoji are tiny images from a workspace-scoped route; next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className ?? styles.customEmoji} src={`/api/workspaces/${workspaceId}/emoji/${encodeURIComponent(code)}`} alt={wrapShortcode(code)} title={wrapShortcode(code)} />;
}
