"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, History, Plus, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { WorkspaceSummary } from "@/lib/chat-types";
import { TICKETS_CHANGED, type AgentMessage, type ChatTurn, type ConversationDetail, type ConversationSummary } from "@/lib/agent-types";
import { HttpError, messageOf, request } from "@/lib/client-http";
import { trackerHref } from "../tickets/ui";
import styles from "./Agent.module.css";

const SUGGESTIONS = ["What is assigned to me?", "Create a high priority ticket called ", "Move a ticket to Done: "];
const ticketKeys = /\b([A-Z][A-Z0-9]{1,9}-[1-9]\d*)\b/;
const remembered = (workspaceId: string) => `synk-agent-conversation:${workspaceId}`;
const changedTickets = (messages: AgentMessage[]) => messages.some(message => message.actions.some(action => action.ok && action.tool !== "find_tickets"));

// The assistant is available on every screen: a launcher button opens this side panel.
export default function AgentPanel() {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // The launcher is hidden while the panel is open, so focus can only return to it after it reappears.
  useEffect(() => {
    if (wasOpen.current && !open) launcher.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const close = () => setOpen(false);
  return <>
    <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open} aria-controls="synk-ai-panel" onClick={() => setOpen(!open)}>
      <Sparkles size={17} aria-hidden="true" /> Ask Synk AI
    </button>
    {open && <Panel onClose={close} />}
  </>;
}

function Panel({ onClose }: { onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<{ workspaces: WorkspaceSummary[] }>("/api/workspaces", { signal: controller.signal }).then(result => {
      setWorkspaces(result.workspaces);
      const saved = window.localStorage.getItem("synk-agent-workspace");
      setWorkspaceId(result.workspaces.find(item => item.id === saved)?.id ?? result.workspaces[0]?.id ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, []);
  const choose = (id: string) => { setWorkspaceId(id); window.localStorage.setItem("synk-agent-workspace", id); };

  return <aside id="synk-ai-panel" className={styles.panel} aria-label="Synk AI assistant" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <header className={styles.head}>
      <Sparkles size={18} aria-hidden="true" /><h2>Synk AI</h2>
      {workspaces && workspaces.length > 1 && <select aria-label="Workspace" value={workspaceId} onChange={event => choose(event.target.value)}>
        {workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>}
      <button type="button" className={styles.iconButton} aria-label="Close Synk AI" onClick={onClose}><X size={18} /></button>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!workspaces && !error && <p role="status" className={styles.note}>Loading…</p>}
    {workspaces && !workspaceId && <p className={styles.note}>Create or join a workspace in <Link href="/chat">chat</Link> first. The assistant works inside a workspace.</p>}
    {/* Remounting per workspace keeps one workspace's conversation out of another. */}
    {workspaceId && <Conversation key={workspaceId} workspaceId={workspaceId} />}
  </aside>;
}

function Conversation({ workspaceId }: { workspaceId: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(""); // the message being answered, shown until the reply arrives
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const waiting = conversation?.messages.some(message => message.pending?.status === "PENDING") ?? false;

  async function openConversation(id: string | null) {
    setShowHistory(false); setError("");
    if (!id) { setConversation(null); window.localStorage.removeItem(remembered(workspaceId)); field.current?.focus(); return; }
    setLoading(true);
    try {
      setConversation((await request<{ conversation: ConversationDetail }>(`/api/ai-agent/conversations/${id}`)).conversation);
      window.localStorage.setItem(remembered(workspaceId), id);
    } catch (error) {
      // A conversation that is gone is simply forgotten; anything else is shown.
      if (error instanceof HttpError && error.status === 404) window.localStorage.removeItem(remembered(workspaceId));
      else setError(messageOf(error));
    } finally { setLoading(false); }
  }

  // On opening: list this workspace's conversations and return to the last one.
  useEffect(() => {
    const controller = new AbortController();
    const saved = window.localStorage.getItem(remembered(workspaceId));
    Promise.all([
      request<{ conversations: ConversationSummary[] }>(`/api/ai-agent/conversations?workspaceId=${workspaceId}`, { signal: controller.signal }),
      saved ? request<{ conversation: ConversationDetail }>(`/api/ai-agent/conversations/${saved}`, { signal: controller.signal }).catch(() => null) : null,
    ]).then(([list, last]) => {
      setConversations(list.conversations);
      setConversation(last?.conversation ?? null);
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); field.current?.focus(); } });
    return () => controller.abort();
  }, [workspaceId]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [conversation?.messages.length, sending, loading]);

  function apply(turn: ChatTurn) {
    setConversation(current => {
      const earlier = (current?.id === turn.conversation.id ? current.messages : [])
        .map(message => message.id === turn.resolved?.messageId && message.pending ? { ...message, pending: { ...message.pending, status: turn.resolved.status } } : message);
      return { ...turn.conversation, messages: [...earlier, ...turn.messages] };
    });
    setConversations(current => [turn.conversation, ...current.filter(item => item.id !== turn.conversation.id)]);
    window.localStorage.setItem(remembered(workspaceId), turn.conversation.id);
    // An open board or sprint list behind the panel reloads to show the change.
    if (changedTickets(turn.messages)) window.dispatchEvent(new Event(TICKETS_CHANGED));
  }
  async function post(body: object) {
    setBusy(true); setError("");
    try {
      apply(await request<ChatTurn>("/api/ai-agent/chat", { method: "POST", body: JSON.stringify(body) }));
      return true;
    } catch (error) { setError(messageOf(error)); return false; } finally { setBusy(false); setSending(""); }
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || waiting) return;
    setSending(text); setDraft("");
    // The text returns to the box if it could not be sent.
    if (!await post(conversation ? { conversationId: conversation.id, message: text } : { workspaceId, message: text })) setDraft(text);
    field.current?.focus();
  }
  const decide = (decision: "approve" | "reject") => void post({ conversationId: conversation!.id, decision });

  return <>
    <div className={styles.toolbar}>
      <Button variant="quiet" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)} disabled={!conversations.length}><History size={15} /> History</Button>
      <Button variant="quiet" onClick={() => void openConversation(null)} disabled={busy || (!conversation && !showHistory)}><Plus size={15} /> New chat</Button>
    </div>
    {showHistory ? <ul className={styles.history} aria-label="Earlier conversations">
      {conversations.map(item => <li key={item.id}><button type="button" aria-current={item.id === conversation?.id} onClick={() => void openConversation(item.id)}>
        <span>{item.title}</span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
      </button></li>)}
    </ul> : <>
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-label="Conversation">
        {loading && <p role="status" className={styles.note}>Loading…</p>}
        {!loading && !conversation && !sending && <div className={styles.welcome}>
          <p>Ask me to create or update tickets, or to find them. I can only do what you are allowed to do, and I ask before changing an existing ticket.</p>
          <ul>{SUGGESTIONS.map(text => <li key={text}><button type="button" onClick={() => { setDraft(text); field.current?.focus(); }}>{text}</button></li>)}</ul>
        </div>}
        {conversation?.messages.map(message => <Message key={message.id} message={message} workspaceId={workspaceId} busy={busy} onDecide={decide} />)}
        {sending && <div className={styles.user}><p>{sending}</p></div>}
        {busy && <p role="status" className={styles.thinking}>Synk AI is working…</p>}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <form className={styles.composer} onSubmit={send}>
        <textarea ref={field} rows={2} maxLength={4000} value={draft} disabled={busy || waiting} aria-label="Message Synk AI"
          placeholder={waiting ? "Confirm or cancel the change above first." : "Ask Synk AI… (Enter to send)"}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
        <Button variant="primary" disabled={busy || waiting || !draft.trim()} aria-label="Send message"><Send size={15} /></Button>
      </form>
    </>}
  </>;
}

// Ticket keys in a reply open the ticket on its board.
function withTicketLinks(text: string, workspaceId: string) {
  return text.split(ticketKeys).map((part, index) => index % 2
    ? <Link key={index} href={`/tickets/${encodeURIComponent(part)}?workspaceId=${encodeURIComponent(workspaceId)}`}>{part}</Link> : part);
}

function Message({ message, workspaceId, busy, onDecide }: { message: AgentMessage; workspaceId: string; busy: boolean; onDecide: (decision: "approve" | "reject") => void }) {
  if (message.role === "USER") return <div className={styles.user}><p>{message.body}</p></div>;
  const pending = message.pending;
  return <div className={styles.assistant}>
    <p>{withTicketLinks(message.body, workspaceId)}</p>
    {message.actions.length > 0 && <section className={styles.actions} aria-label="Actions taken">
      <h3>Actions taken</h3>
      <ul>{message.actions.map((action, index) => <li key={index} data-ok={action.ok}>
        {action.ok ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
        <span><span className={styles.srOnly}>{action.ok ? "Done: " : "Not done: "}</span>{action.summary}
          {action.target && <> <Link href={trackerHref("board", { workspaceId, projectId: action.target.projectId, boardId: action.target.boardId, ticket: action.target.id })}>Open {action.target.key}</Link></>}</span>
      </li>)}</ul>
    </section>}
    {pending && <section className={styles.pending} aria-label="Change waiting for your confirmation" data-status={pending.status}>
      <h3>{pending.status === "PENDING" ? "Confirm this change" : pending.status === "APPROVED" ? "Change approved" : "Change cancelled"}</h3>
      {pending.target && <p className={styles.target}>{pending.target.key} · {pending.target.title}</p>}
      {pending.changes.length ? <dl>{pending.changes.map((change, index) => <div key={index}>
        <dt>{change.field}</dt><dd><s>{change.from}</s> <span aria-hidden="true">→</span><span className={styles.srOnly}> becomes </span> <strong>{change.to}</strong></dd>
      </div>)}</dl> : <p>{pending.summary}</p>}
      {pending.status === "PENDING" && <div className={styles.decision}>
        <Button variant="primary" disabled={busy} onClick={() => onDecide("approve")}>Confirm</Button>
        <Button disabled={busy} onClick={() => onDecide("reject")}>Cancel</Button>
      </div>}
    </section>}
  </div>;
}
