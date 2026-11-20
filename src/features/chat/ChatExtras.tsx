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

// Rename, posting rules, privacy, archiving and removing members. For the creator and workspace admins.
export function ChannelSettingsModal({ channel, viewerId, onClose, onChanged }: {
  channel: ChannelSummary; viewerId: string; onClose: () => void; onChanged: (channel: ChannelSummary) => void;
}) {
  const [name, setName] = useState(channel.name ?? "");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    request<{ members: Member[] }>(`/api/channels/${channel.id}/members`).then(result => setMembers(result.members)).catch(error => setError(messageOf(error)));
  }, [channel.id]);
  const save = async (body: object, done: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ channel: ChannelSummary }>(`/api/channels/${channel.id}/settings`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged(result.channel); setNotice(done);
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  };
  const remove = async (member: Member) => {
    if (!window.confirm(`Remove ${member.user.name ?? member.user.email} from #${channel.name}?`)) return;
    setBusy(true); setError("");
    try {
      await request(`/api/channels/${channel.id}/members/${member.user.id}`, { method: "DELETE" });
      setMembers(current => current?.filter(item => item.user.id !== member.user.id) ?? null);
      setNotice(`${member.user.name ?? "They"} can no longer see #${channel.name}.`);
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  };

  return <div className={styles.modalBackdrop} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.setup} role="dialog" aria-modal="true" aria-label={`Settings for #${channel.name}`}>
      <div className={styles.setupHeader}><h2>#{channel.name} settings</h2><button type="button" className={styles.iconBtn} aria-label="Close settings" onClick={onClose}><X size={18} /></button></div>
      <form className={styles.settingsRow} onSubmit={event => { event.preventDefault(); void save({ name }, "Channel renamed."); }}>
        <label>Channel name<Input value={name} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Lowercase letters, numbers and hyphens" onChange={event => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))} /></label>
        <Button variant="primary" disabled={busy || !name || name === channel.name}>Rename</Button>
      </form>
      <label className={styles.settingsToggle}>
        <span><Megaphone size={15} aria-hidden="true" /> <strong>Announcement-only</strong><small>Only workspace admins and the channel&apos;s creator can post. Everyone can still reply in threads.</small></span>
        <input type="checkbox" role="switch" checked={channel.postingPolicy === "ADMINS"} disabled={busy} onChange={event => void save({ postingPolicy: event.target.checked ? "ADMINS" : "EVERYONE" }, event.target.checked ? "Only admins can post now." : "Everyone can post now.")} />
      </label>
      {channel.type === "PUBLIC" && !channel.isDefault && <div className={styles.settingsAction}>
        <span><strong>Make private</strong><small>Only current members keep access, and others can&apos;t find or join it. This can&apos;t be undone.</small></span>
        <Button disabled={busy} onClick={() => { if (window.confirm(`Make #${channel.name} private? This can't be undone.`)) void save({ private: true }, "The channel is now private."); }}>Make private</Button>
      </div>}
      {!channel.isDefault && <div className={styles.settingsAction}>
        <span><Archive size={15} aria-hidden="true" /> <strong>{channel.archived ? "Unarchive" : "Archive"}</strong><small>{channel.archived ? "Reopens the channel for new messages." : "Keeps the history but stops new messages. You can unarchive it later."}</small></span>
        <Button disabled={busy} onClick={() => void save({ archived: !channel.archived }, channel.archived ? "The channel is open again." : "The channel is archived.")}>{channel.archived ? "Unarchive" : "Archive channel"}</Button>
      </div>}
      <h3 className={styles.settingsHeading}>Members</h3>
      {!members && !error && <p role="status">Loading members…</p>}
      <ul className={styles.settingsMembers}>{members?.map(member => <li key={member.user.id}>
        <Avatar small initials={initialsOf(member.user.name ?? "")} />
        <span><strong>{member.user.name ?? "Member"}</strong><small>{member.user.email}</small></span>
        {!channel.isDefault && member.user.id !== viewerId && <Button variant="quiet" disabled={busy} onClick={() => void remove(member)}>Remove</Button>}
      </li>)}</ul>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p role="status" className={styles.settingsNotice}>{notice}</p>
    </section>
  </div>;
}
