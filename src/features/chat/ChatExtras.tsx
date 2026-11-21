"use client";

import { useEffect, useState } from "react";
import { Archive, Bookmark, BookmarkCheck, Link2, MailOpen, Megaphone, MessagesSquare, X } from "lucide-react";
import { Avatar, Button, Input, SkeletonList } from "@/components/Primitives";
import Modal from "@/components/Modal";
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

  return <Modal label={`Settings for #${channel.name}`} className={styles.dialog} onClose={onClose}>
    <section className={styles.setup}>
      <div className={styles.setupHeader}><h2>#{channel.name} settings</h2><button type="button" className={styles.iconBtn} aria-label="Close settings" onClick={onClose}><X size={18} /></button></div>
      <form className={styles.settingsRow} onSubmit={event => { event.preventDefault(); void save({ name }, "Channel renamed."); }}>
        <label>Channel name<Input value={name} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Lowercase letters, numbers and hyphens" onChange={event => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))} /></label>
        <Button variant="primary" disabled={busy || !name || name === channel.name}>Rename</Button>
      </form>
      <label className={styles.settingsToggle}>
        <span><strong><Megaphone size={15} aria-hidden="true" /> Announcement-only</strong><small>Only workspace admins and the channel&apos;s creator can post. Everyone can still reply in threads.</small></span>
        <input type="checkbox" role="switch" checked={channel.postingPolicy === "ADMINS"} disabled={busy} onChange={event => void save({ postingPolicy: event.target.checked ? "ADMINS" : "EVERYONE" }, event.target.checked ? "Only admins can post now." : "Everyone can post now.")} />
      </label>
      {channel.type === "PUBLIC" && !channel.isDefault && <div className={styles.settingsAction}>
        <span><strong>Make private</strong><small>Only current members keep access, and others can&apos;t find or join it. This can&apos;t be undone.</small></span>
        <Button disabled={busy} onClick={() => { if (window.confirm(`Make #${channel.name} private? This can't be undone.`)) void save({ private: true }, "The channel is now private."); }}>Make private</Button>
      </div>}
      {!channel.isDefault && <div className={styles.settingsAction}>
        <span><strong><Archive size={15} aria-hidden="true" /> {channel.archived ? "Unarchive" : "Archive"}</strong><small>{channel.archived ? "Reopens the channel for new messages." : "Keeps the history but stops new messages. You can unarchive it later."}</small></span>
        <Button disabled={busy} onClick={() => void save({ archived: !channel.archived }, channel.archived ? "The channel is open again." : "The channel is archived.")}>{channel.archived ? "Unarchive" : "Archive channel"}</Button>
      </div>}
      <h3 className={styles.settingsHeading}>Members</h3>
      {!members && !error && <SkeletonList label="Loading members…" rows={2} height={36} />}
      <ul className={styles.settingsMembers}>{members?.map(member => <li key={member.user.id}>
        <Avatar small initials={initialsOf(member.user.name ?? "")} />
        <span className={styles.settingsMember}><strong>{member.user.name ?? "Member"}</strong><small>{member.user.email}</small></span>
        {!channel.isDefault && member.user.id !== viewerId && <Button variant="quiet" disabled={busy} onClick={() => void remove(member)}>Remove</Button>}
      </li>)}</ul>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p role="status" className={styles.settingsNotice}>{notice}</p>
    </section>
  </Modal>;
}

type Pick = (channelId: string, messageId: string) => void;

// Threads you started or replied in, most recently active first.
export function ThreadsInbox({ workspaceId, onOpen }: { workspaceId: string; onOpen: Pick }) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<{ threads: ThreadSummary[] }>(`/api/workspaces/${workspaceId}/threads`).then(result => setThreads(result.threads)).catch(error => setError(messageOf(error)));
  }, [workspaceId]);
  return <section className={styles.listView} aria-label="Threads">
    <header><MessagesSquare size={18} aria-hidden="true" /><h2>Threads</h2><p>Conversations you started or replied to.</p></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!threads && !error && <SkeletonList label="Loading threads…" height={84} />}
    {threads && !threads.length && <div className={styles.empty}><MessagesSquare aria-hidden="true" /><h3>No threads yet</h3><p>Reply to a message in any channel and the conversation shows up here.</p></div>}
    <ul>{threads?.map(thread => <li key={thread.rootId}>
      <button type="button" onClick={() => onOpen(thread.channelId, thread.rootId)}>
        <span className={styles.listPlace}>{thread.place} · {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}</span>
        <span className={styles.listRow}><Avatar small initials={initialsOf(thread.author.name ?? "")} src={thread.author.image} /><span><strong>{thread.author.name ?? "Member"}</strong> {thread.snippet}</span></span>
        <span className={styles.listReply}>Latest from {thread.lastReply.author.name ?? "Member"}, {when(thread.lastReply.at)}: {thread.lastReply.snippet}</span>
      </button>
    </li>)}</ul>
  </section>;
}

// Messages saved for later, newest saved first.
export function SavedList({ workspaceId, onOpen }: { workspaceId: string; onOpen: Pick }) {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [error, setError] = useState("");
  const load = () => request<{ saved: SavedItem[] }>(`/api/workspaces/${workspaceId}/saved`).then(result => setItems(result.saved)).catch(error => setError(messageOf(error)));
  useEffect(() => { void load(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const unsave = async (item: SavedItem) => {
    try { await request(`/api/messages/${item.messageId}/save`, { method: "POST" }); setItems(current => current?.filter(other => other.messageId !== item.messageId) ?? null); }
    catch (error) { setError(messageOf(error)); }
  };
  return <section className={styles.listView} aria-label="Saved items">
    <header><Bookmark size={18} aria-hidden="true" /><h2>Saved for later</h2><p>Messages you saved to come back to.</p></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!items && !error && <SkeletonList label="Loading saved items…" height={64} />}
    {items && !items.length && <div className={styles.empty}><Bookmark aria-hidden="true" /><h3>Nothing saved yet</h3><p>Hover a message and choose the bookmark to keep it here for later.</p></div>}
    <ul>{items?.map(item => <li key={item.messageId} className={styles.listItem}>
      <button type="button" onClick={() => onOpen(item.channelId, item.threadRootId ?? item.messageId)}>
        <span className={styles.listPlace}>{item.place} · {when(item.sentAt)}</span>
        <span className={styles.listRow}><Avatar small initials={initialsOf(item.author.name ?? "")} src={item.author.image} /><span><strong>{item.author.name ?? "Member"}</strong> {item.snippet}</span></span>
      </button>
      <Button variant="quiet" aria-label={`Remove “${item.snippet.slice(0, 40)}” from saved items`} onClick={() => void unsave(item)}>Remove</Button>
    </li>)}</ul>
  </section>;
}
