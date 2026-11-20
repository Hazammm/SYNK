"use client";

import { useEffect, useState } from "react";
import { Archive, Bookmark, BookmarkCheck, Link2, MailOpen, Megaphone, MessagesSquare, X } from "lucide-react";
import { Avatar, Button, Input } from "@/components/Primitives";
import { initialsOf } from "@/components/ProfileMenu";
import type { ChannelSummary, ChatMessage, SavedItem, ThreadSummary } from "@/lib/chat-types";
import { messageOf, request } from "./client";
import styles from "./Chat.module.css";

type Member = { role: "ADMIN" | "MEMBER"; user: { id: string; name: string | null; email: string | null } };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The address of a message: opening it jumps to the message in its channel.
export const messageLink = (message: { id: string; channelId: string; workspaceId?: string }, workspaceId: string) =>
  `${window.location.origin}/w/${message.workspaceId ?? workspaceId}/chat/${message.channelId}?message=${message.id}`;

// Save for later, copy link and mark unread, shown in a message's action bar.
export function MessageExtraActions({ message, workspaceId, onStatus }: { message: ChatMessage; workspaceId: string; onStatus: (text: string) => void }) {
  const [saved, setSaved] = useState(Boolean(message.saved));
  const run = async (action: () => Promise<string>) => { try { onStatus(await action()); } catch (error) { onStatus(messageOf(error)); } };
  return <>
    <button type="button" className={styles.actionBtn} aria-label={saved ? "Remove from saved items" : "Save for later"} title={saved ? "Remove from saved items" : "Save for later"}
      onClick={() => void run(async () => { const result = await request<{ saved: boolean }>(`/api/messages/${message.id}/save`, { method: "POST" }); setSaved(result.saved); return result.saved ? "Saved for later." : "Removed from saved items."; })}>
      {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
    </button>
    <button type="button" className={styles.actionBtn} aria-label="Copy link to message" title="Copy link"
      onClick={() => void run(async () => { await navigator.clipboard.writeText(messageLink(message, workspaceId)); return "Link copied."; })}>
      <Link2 size={14} />
    </button>
    <button type="button" className={styles.actionBtn} aria-label="Mark unread from here" title="Mark unread"
      onClick={() => void run(async () => { await request(`/api/messages/${message.id}/unread`, { method: "POST" }); return "Marked unread from this message."; })}>
      <MailOpen size={14} />
    </button>
  </>;
}
