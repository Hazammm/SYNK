"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Timer, Trash2, X } from "lucide-react";
import { Avatar, Button, Input } from "@/components/Primitives";
import type { BoardSummary, ProjectDetail, ProjectMember, TicketComment, TicketDetail } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import { TIMER_CHANGED, type TimerStart } from "@/lib/time-types";
import Modal from "./Modal";
import { formatDateTime, initials, PRIORITIES } from "./ui";
import styles from "./Tracker.module.css";

// Either an existing ticket to open, or the column a new ticket starts in.
export type DrawerTarget = { ticketId: string } | { columnId: string };
type Props = {
  target: DrawerTarget; project: ProjectDetail; board?: BoardSummary; userId: string; canWrite: boolean;
  onClose: () => void; onSaved: (ticket: TicketDetail) => void; onCreated?: (ticket: TicketDetail) => void; onDeleted?: (ticketId: string) => void;
};
type Form = { title: string; description: string; priority: string; assigneeId: string; sprintId: string; dueDate: string; columnId: string };
const formOf = (ticket: TicketDetail): Form => ({
  title: ticket.title, description: ticket.description, priority: ticket.priority, assigneeId: ticket.assignee?.id ?? "",
  sprintId: ticket.sprintId ?? "", dueDate: ticket.dueDate ?? "", columnId: ticket.columnId,
});
// Empty selects mean "none", which the API expects as null.
const payloadOf = (form: Form, fields: (keyof Form)[]) => Object.fromEntries(fields.map(field =>
  [field, ["assigneeId", "sprintId", "dueDate"].includes(field) ? form[field] || null : form[field]]));

export default function TicketDrawer({ target, project, board, userId, canWrite, onClose, onSaved, onCreated, onDeleted }: Props) {
  const ticketId = "ticketId" in target ? target.ticketId : null;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  useEffect(() => {
    if (!ticketId) return;
    const controller = new AbortController();
    request<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}`, { signal: controller.signal })
      .then(result => setTicket(result.ticket)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [ticketId]);
  const ticketBoard = ticket ? project.boards.find(item => item.id === ticket.boardId) : board;
  const update = (next: TicketDetail) => { setTicket(next); onSaved(next); };
  const mayClose = () => !dirty.current || window.confirm("Discard your unsaved changes to this ticket?");

  return <Modal className={styles.drawer} label={ticket ? `Ticket ${ticket.key}` : ticketId ? "Ticket" : "New ticket"} onClose={onClose}
    confirmClose={mayClose}>
    <header className={styles.drawerHead}>
      <span className={styles.key}>{ticket?.key ?? (ticketId ? "" : `New ticket in ${project.name}`)}</span>
      <button type="button" className={styles.iconButton} aria-label="Close ticket" onClick={() => { if (mayClose()) onClose(); }}><X size={18} /></button>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {ticketId && !ticket && !error && <p role="status" className={styles.loading}>Loading ticket…</p>}
    {ticketBoard && (ticket || !ticketId) && <Editor key={ticket?.id ?? "new"} ticket={ticket} project={project} board={ticketBoard} canWrite={canWrite}
      startColumnId={"columnId" in target ? target.columnId : undefined} onDirty={value => { dirty.current = value; }}
      onSaved={update} onCreated={created => onCreated?.(created)} onDeleted={onDeleted} />}
    {ticket && <Comments ticket={ticket} members={project.members} userId={userId} canWrite={canWrite}
      onAdded={comment => update({ ...ticket, comments: [...ticket.comments, comment], commentCount: ticket.commentCount + 1 })} />}
  </Modal>;
}

function Editor({ ticket, project, board, canWrite, startColumnId, onDirty, onSaved, onCreated, onDeleted }: {
  ticket: TicketDetail | null; project: ProjectDetail; board: BoardSummary; canWrite: boolean; startColumnId?: string;
  onDirty: (dirty: boolean) => void; onSaved: (ticket: TicketDetail) => void; onCreated: (ticket: TicketDetail) => void; onDeleted?: (ticketId: string) => void;
}) {
  const blank: Form = { title: "", description: "", priority: "MEDIUM", assigneeId: "", sprintId: "", dueDate: "", columnId: startColumnId ?? board.columns[0].id };
  const [saved, setSaved] = useState(ticket ? formOf(ticket) : blank);
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const changed = (Object.keys(form) as (keyof Form)[]).filter(field => form[field] !== saved[field]);
  const dirty = changed.length > 0;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const set = (field: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setForm({ ...form, [field]: event.target.value }); setNotice(""); };
  // Completed sprints are closed to new tickets, but a ticket already in one still shows it.
  const sprints = project.sprints.filter(sprint => sprint.state !== "COMPLETED" || sprint.id === saved.sprintId);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (ticket) {
        // Send only what changed: an unchanged status must not re-order the ticket.
        const result = await request<{ ticket: TicketDetail }>(`/api/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify(payloadOf(form, changed)) });
        const next = formOf(result.ticket);
        setSaved(next); setForm(next); setNotice("Changes saved."); onSaved(result.ticket);
      } else {
        const result = await request<{ ticket: TicketDetail }>("/api/tickets", { method: "POST", body: JSON.stringify({ boardId: board.id, ...payloadOf(form, Object.keys(form) as (keyof Form)[]) }) });
        onDirty(false); onCreated(result.ticket);
      }
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  async function startTimer() {
    if (!ticket) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { stopped } = await request<TimerStart>("/api/time-entries/start", { method: "POST", body: JSON.stringify({ ticketId: ticket.id }) });
      window.dispatchEvent(new Event(TIMER_CHANGED));
      setNotice(stopped ? `Timer started. The timer on ${stopped.ticket.key} was stopped.` : "Timer started. Stop it from the Time page.");
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  async function remove() {
    if (!ticket || !window.confirm(`Delete ${ticket.key}? Its comments and alerts are deleted too. This cannot be undone.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/tickets/${ticket.id}`, { method: "DELETE" });
      onDirty(false); onDeleted?.(ticket.id);
    } catch (error) { setError(messageOf(error)); setBusy(false); }
  }

  return <form className={styles.editor} onSubmit={submit}>
    <label>Title<Input autoFocus={!ticket} required maxLength={200} value={form.title} onChange={set("title")} disabled={!canWrite} placeholder="What needs to be done?" /></label>
    <label>Description<textarea rows={5} maxLength={8000} value={form.description} onChange={set("description")} disabled={!canWrite} placeholder={canWrite ? "Add steps, context or acceptance criteria." : "No description."} /></label>
    <div className={styles.fieldRow}>
      <label>Status<select value={form.columnId} onChange={set("columnId")} disabled={!canWrite}>{board.columns.map(column => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
      <label>Priority<select value={form.priority} onChange={set("priority")} disabled={!canWrite}>{PRIORITIES.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
    </div>
    <div className={styles.fieldRow}>
      <label>Assignee<select value={form.assigneeId} onChange={set("assigneeId")} disabled={!canWrite}><option value="">Unassigned</option>{project.members.map(member => <option key={member.id} value={member.id}>{member.name ?? "Member"}</option>)}</select></label>
      <label>Sprint<select value={form.sprintId} onChange={set("sprintId")} disabled={!canWrite}><option value="">No sprint (backlog)</option>{sprints.map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></label>
    </div>
    <div className={styles.fieldRow}>
      <label>Due date<Input type="date" value={form.dueDate} onChange={set("dueDate")} disabled={!canWrite} /></label>
      {ticket && <p className={styles.facts}>Reported by {ticket.reporter?.name ?? "a former member"}<br />Created {formatDateTime(ticket.createdAt)}<br />Updated {formatDateTime(ticket.updatedAt)}</p>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {canWrite && <div className={styles.actions}>
      <Button variant="primary" disabled={busy || (ticket ? !dirty : false)}>{busy ? "Saving…" : ticket ? "Save changes" : "Create ticket"}</Button>
      {ticket && dirty && <Button type="button" variant="quiet" onClick={() => setForm(saved)}>Discard changes</Button>}
      <span role="status">{notice}</span>
      {ticket && <Button type="button" disabled={busy} onClick={() => void startTimer()}><Timer size={15} /> Start timer</Button>}
      {ticket && onDeleted && <Button type="button" variant="quiet" className={styles.danger} disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Delete ticket</Button>}
    </div>}
  </form>;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Shows "@Name" in bold when it matches someone on the project.
function withMentions(body: string, members: ProjectMember[]) {
  const names = members.flatMap(member => member.name ? [escapeRegExp(member.name)] : []).sort((a, b) => b.length - a.length);
  if (!names.length) return body;
  return body.split(new RegExp(`(@(?:${names.join("|")}))`, "gi")).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part);
}

function Comments({ ticket, members, userId, canWrite, onAdded }: { ticket: TicketDetail; members: ProjectMember[]; userId: string; canWrite: boolean; onAdded: (comment: TicketComment) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The "@par" being typed just before the caret, if any.
  const [mention, setMention] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const others = members.filter(member => member.id !== userId && member.name);
  const matches = mention ? others.filter(member => member.name!.toLowerCase().startsWith(mention.text.toLowerCase())).slice(0, 5) : [];

  function track(value: string, caret: number) {
    const match = /(?:^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setMention(match ? { start: caret - match[1].length - 1, text: match[1] } : null); setActive(0);
  }
  function pick(member: ProjectMember) {
    const input = field.current!;
    const inserted = `@${member.name} `;
    const next = body.slice(0, mention!.start) + inserted + body.slice(input.selectionStart);
    const caret = mention!.start + inserted.length;
    setBody(next); setMention(null);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(caret, caret); });
  }
  function keyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((active + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); pick(matches[active]); return; }
      if (event.key === "Escape") { event.preventDefault(); setMention(null); return; } // close the list, not the ticket
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true); setError("");
    const lower = body.toLowerCase();
    const mentionIds = others.filter(member => lower.includes(`@${member.name!.toLowerCase()}`)).map(member => member.id);
    try {
      const result = await request<{ comment: TicketComment }>(`/api/tickets/${ticket.id}/comments`, { method: "POST", body: JSON.stringify({ body, mentionIds }) });
      setBody(""); setMention(null); onAdded(result.comment);
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  return <section className={styles.comments} aria-label="Comments">
    <h2>Comments <span>{ticket.commentCount}</span></h2>
    {!ticket.comments.length && <p className={styles.muted}>No comments yet.</p>}
    <ol>{ticket.comments.map(comment => <li key={comment.id}>
      <Avatar small initials={initials(comment.author.name)} />
      <div><p className={styles.commentMeta}><strong>{comment.author.name ?? "Member"}</strong><time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time></p><p className={styles.commentBody}>{withMentions(comment.body, members)}</p></div>
    </li>)}</ol>
    {canWrite && <form onSubmit={submit} className={styles.commentForm}>
      <textarea ref={field} rows={3} maxLength={4000} value={body} disabled={busy} placeholder="Write a comment. Type @ to mention a teammate."
        aria-label="Write a comment" role="combobox" aria-autocomplete="list" aria-expanded={matches.length > 0} aria-controls="mention-options"
        aria-activedescendant={matches.length ? `mention-option-${active}` : undefined}
        onChange={event => { setBody(event.target.value); track(event.target.value, event.target.selectionStart); }} onKeyDown={keyDown} onBlur={() => setMention(null)} />
      <ul id="mention-options" role="listbox" aria-label="Teammates to mention" className={styles.mentions} hidden={!matches.length}>
        {matches.map((member, index) => <li key={member.id} id={`mention-option-${index}`} role="option" aria-selected={index === active}
          // mousedown, not click: picking must happen before the textarea's blur closes the list.
          onMouseDown={event => { event.preventDefault(); pick(member); }}><Avatar small initials={initials(member.name)} /> {member.name}</li>)}
      </ul>
      {error && <p role="alert" className={styles.error}>{error} Your comment is kept; press Comment to retry.</p>}
      <div className={styles.actions}><Button variant="primary" disabled={busy || !body.trim()}><Send size={15} /> {busy ? "Posting…" : "Comment"}</Button><small>The assignee and anyone you @mention are notified. Ctrl+Enter to post.</small></div>
    </form>}
  </section>;
}
