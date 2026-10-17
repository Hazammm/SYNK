"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Hash, LockKeyhole, MessageCircle, Plus, Send, X } from "lucide-react";
import { Button, Input, Avatar } from "@/components/Primitives";
import type { ChannelSummary, ChatMessage, WorkspaceSummary } from "@/lib/chat-types";
import { messageOf, request, useMessages } from "./client";
import styles from "./Chat.module.css";

type Member = { role: "ADMIN" | "MEMBER"; user: { id: string; name: string | null; email: string | null } };
const initials = (name: string | null) => (name ?? "Member").split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();

export default function ChatWorkspace({ initialWorkspaces, initialWorkspaceId }: { initialWorkspaces: WorkspaceSummary[]; initialWorkspaceId?: string }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [selected, setSelected] = useState(initialWorkspaces.find(item => item.id === initialWorkspaceId)?.id ?? initialWorkspaces[0]?.id ?? "");
  const [creating, setCreating] = useState(!initialWorkspaces.length);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workspace = workspaces.find(item => item.id === selected);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request<{ workspace: WorkspaceSummary }>("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) });
      setWorkspaces(current => [...current, result.workspace]); setSelected(result.workspace.id); setCreating(false); setName("");
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  return <div className={styles.workspace}>
    <div className={styles.workspaceBar}>
      <div><span className={styles.eyebrow}>TEAM WORKSPACE</span><h1>Conversations</h1></div>
      <label className={styles.selector}>Workspace<select aria-label="Workspace" value={selected} onChange={event => setSelected(event.target.value)} disabled={!workspaces.length}>
        {!workspaces.length && <option value="">No workspaces yet</option>}
        {workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <Button onClick={() => setCreating(!creating)}><Plus size={15} /> New workspace</Button>
    </div>
    {creating && <form onSubmit={create} className={styles.setup}>
      <h2>{workspaces.length ? "Create a workspace" : "Bring your team together"}</h2>
      <p>Create a workspace to start chatting, or ask an admin to add your registered email and refresh this page.</p>
      <label>Workspace name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Synk FYP" /></label>
      <Button variant="primary" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</Button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>}
    {workspace && <WorkspaceChannels key={workspace.id} workspace={workspace} />}
  </div>;
}

function WorkspaceChannels({ workspace }: { workspace: WorkspaceSummary }) {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const channel = channels.find(item => item.id === selected);
  useEffect(() => {
    const controller = new AbortController();
    request<{ channels: ChannelSummary[] }>(`/api/workspaces/${workspace.id}/channels`, { signal: controller.signal }).then(result => {
      setChannels(result.channels); setSelected(current => result.channels.some(item => item.id === current) ? current : (result.channels.find(item => item.joined)?.id ?? result.channels[0]?.id ?? "")); setError("");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspace.id, revision]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ channel: ChannelSummary }>(`/api/workspaces/${workspace.id}/channels`, { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description"), isPrivate: form.get("isPrivate") === "on" }) });
      setSelected(result.channel.id); setCreating(false); setRevision(value => value + 1);
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  async function join() {
    if (!channel) return;
    setBusy(true); setError("");
    try { await request(`/api/channels/${channel.id}/join`, { method: "POST" }); setRevision(value => value + 1); }
    catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  return <>
    <div className={styles.columns}>
      <aside className={styles.channels}>
        <div className={styles.sideHeading}><strong>Channels</strong><button aria-label="Create channel" onClick={() => setCreating(!creating)}><Plus size={17} /></button></div>
        {loading && <p role="status">Loading channels…</p>}
        {channels.map(item => <button className={`${styles.channel} ${selected === item.id ? styles.active : ""}`} key={item.id} onClick={() => setSelected(item.id)}>
          {item.isPrivate ? <LockKeyhole size={15} /> : <Hash size={15} />} <span>{item.name}</span>{!item.joined && <small>Join</small>}
        </button>)}
        {!loading && !channels.length && <p>No channels yet. Create your first one.</p>}
        <Button onClick={() => setShowMembers(!showMembers)}>Workspace members</Button>
        <small className={styles.role}>{workspace.role === "ADMIN" ? "Workspace admin" : "Workspace member"}</small>
      </aside>
      <div className={styles.content}>
        {error && <div role="alert" className={styles.error}>{error} <button onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
        {creating && <form onSubmit={create} className={styles.setup}>
          <h2>Create a channel</h2>
          <label>Channel name<Input name="name" placeholder="e.g. development" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label>Description<Input name="description" maxLength={240} placeholder="What is this channel for?" /></label>
          <label className={styles.check}><input type="checkbox" name="isPrivate" /> Private channel</label>
          <p>Private channels are visible only to their members. The creator or a workspace admin who has joined can add teammates.</p>
          <Button disabled={busy} variant="primary">{busy ? "Creating…" : "Create channel"}</Button>
        </form>}
        {showMembers && <Members key={`${workspace.id}-${channel?.id}`} workspace={workspace} channel={channel} onAdded={() => setRevision(value => value + 1)} />}
        {channel?.joined ? <ChannelView key={channel.id} channel={channel} /> : channel ? <div className={styles.empty}><Hash size={32} /><h2>Join #{channel.name}</h2><p>{channel.description || "Join the conversation to read and send messages."}</p><Button disabled={busy} variant="primary" onClick={join}>Join channel</Button></div> : !loading && <div className={styles.empty}><MessageCircle size={32} /><h2>Start a conversation</h2><p>Select or create a channel.</p></div>}
      </div>
    </div>
  </>;
}

function Members({ workspace, channel, onAdded }: { workspace: WorkspaceSummary; channel?: ChannelSummary; onAdded: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<{ members: Member[] }>(`/api/workspaces/${workspace.id}/members`, { signal: controller.signal }).then(result => setMembers(result.members)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [workspace.id, revision]);
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); setRevision(value => value + 1); onAdded(); }
    catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  return <section className={styles.setup}><h2>Workspace members</h2>
    {workspace.role === "ADMIN" && <form className={styles.memberForm} onSubmit={event => { event.preventDefault(); void act(() => request(`/api/workspaces/${workspace.id}/members`, { method: "POST", body: JSON.stringify({ email }) }), "Teammate added. They can now join public channels."); }}>
      <label>Registered teammate’s email<Input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="teammate@example.com" /></label><Button disabled={busy}>Add to workspace</Button>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    <ul className={styles.members}>{members.map(member => <li key={member.user.id}><Avatar small initials={initials(member.user.name)} /><span><strong>{member.user.name}</strong><small>{member.user.email} · {member.role.toLowerCase()}</small></span>
      {channel?.canManageMembers && channel.joined && <Button disabled={busy} onClick={() => void act(() => request(`/api/channels/${channel.id}/members`, { method: "POST", body: JSON.stringify({ userId: member.user.id }) }), `Added to #${channel.name}.`)}>Add to #{channel.name}</Button>}
    </li>)}</ul>
  </section>;
}

function ChannelView({ channel }: { channel: ChannelSummary }) {
  const [thread, setThread] = useState<ChatMessage | null>(null);
  return <div className={`${styles.chat} ${thread ? styles.withThread : ""}`}>
    <section className={styles.mainFeed} aria-label={`Channel ${channel.name}`}>
      <header className={styles.channelHeader}><div>{channel.isPrivate ? <LockKeyhole size={22} /> : <Hash size={24} />}<div><h2>{channel.name}</h2><p>{channel.description}</p></div></div><small>{channel.memberCount} {channel.memberCount === 1 ? "member" : "members"}</small></header>
      <Feed channel={channel} parentId={null} onThread={setThread} />
    </section>
    {thread && <section className={styles.thread} aria-label="Thread"><header className={styles.channelHeader}><h2>Thread</h2><button aria-label="Close thread" onClick={() => setThread(null)}><X size={18} /></button></header><div className={styles.threadRoot}><Message message={thread} workspaceId={channel.workspaceId} /></div><Feed key={thread.id} channel={channel} parentId={thread.id} /></section>}
  </div>;
}

function Feed({ channel, parentId, onThread }: { channel: ChannelSummary; parentId: string | null; onThread?: (message: ChatMessage) => void }) {
  const feed = useMessages(channel.id, parentId);
  const end = useRef<HTMLDivElement>(null);
  const lastId = feed.messages.at(-1)?.id;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [lastId]);
  return <>
    <div className={styles.connection} role="status"><i data-live={feed.connected} />{feed.connected ? "Live" : "Reconnecting…"}</div>
    {feed.error && <p role="alert" className={styles.error}>{feed.error} {!feed.denied && <button onClick={feed.refresh}>Retry history</button>}</p>}
    <div className={styles.messages} role="log" aria-label={parentId ? "Thread replies" : "Channel messages"} aria-live="polite" aria-busy={feed.loading}>
      {feed.loading && <p>Loading messages…</p>}
      {feed.nextCursor && <button disabled={feed.loadingOlder} className={styles.loadOlder} onClick={feed.loadOlder}>{feed.loadingOlder ? "Loading…" : "Load older messages"}</button>}
      {!feed.loading && !feed.messages.length && !feed.denied && <div className={styles.empty}><MessageCircle size={28} /><h3>{parentId ? "Keep the discussion going" : `Welcome to #${channel.name}`}</h3><p>{parentId ? "Write the first reply." : "Start a conversation with your team."}</p></div>}
      {feed.messages.map(message => <Message key={message.id} message={message} workspaceId={channel.workspaceId} onThread={onThread} />)}
      <div ref={end} />
    </div>
    <Composer channelId={channel.id} parentId={parentId} disabled={feed.denied || feed.loading} onSent={feed.append} />
  </>;
}

function Message({ message, workspaceId, onThread }: { message: ChatMessage; workspaceId: string; onThread?: (message: ChatMessage) => void }) {
  const parts = message.body.split(/(\b[A-Z][A-Z0-9]{1,9}-[1-9]\d*\b)/g);
  return <article className={styles.message} data-message-id={message.id}><Avatar small initials={initials(message.sender.name)} /><div><div className={styles.meta}><strong>{message.sender.name ?? "Member"}</strong><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
    <p>{parts.map((part, index) => index % 2 ? <Link key={index} href={`/tickets/${encodeURIComponent(part)}?workspaceId=${encodeURIComponent(workspaceId)}`}>{part}</Link> : part)}</p>
    {onThread && <button className={styles.reply} onClick={() => onThread(message)}><MessageCircle size={13} /> {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"} · Reply</button>}
  </div></article>;
}

function Composer({ channelId, parentId, disabled, onSent }: { channelId: string; parentId: string | null; disabled: boolean; onSent: (message: ChatMessage) => void }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ body: string; id: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const sending = useRef(false);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending.current || disabled || !draft.trim()) return;
    sending.current = true; setBusy(true); setError("");
    const body = draft.trim();
    if (!pending.current || pending.current.body !== body) pending.current = { body, id: crypto.randomUUID() };
    try {
      const result = await request<{ message: ChatMessage }>(`/api/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ body, parentId, clientMessageId: pending.current.id }) });
      onSent(result.message); setDraft(""); pending.current = null;
    } catch (error) { setError(messageOf(error)); } finally { sending.current = false; setBusy(false); }
  }
  return <form ref={form} className={styles.composer} onSubmit={send}>
    {error && <p role="alert" className={styles.error}>{error} Your draft is kept; press Send to retry.</p>}
    <div><textarea aria-label={parentId ? "Reply to thread" : "Message"} placeholder={parentId ? "Reply to thread…" : "Write a message…"} value={draft} onChange={event => setDraft(event.target.value)} disabled={disabled || busy} maxLength={4000} rows={2} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); form.current?.requestSubmit(); } }} /><Button aria-label={parentId ? "Send reply" : "Send message"} variant="primary" disabled={disabled || busy || !draft.trim()}><Send size={16} /> {busy ? "Sending…" : "Send"}</Button></div>
    <small>Enter to send · Shift+Enter for a new line · {draft.length}/4000</small>
  </form>;
}
