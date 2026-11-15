"use client";

import { useEffect, useState } from "react";
import { GitPullRequest, X } from "lucide-react";
import { Badge, Button, Input } from "@/components/Primitives";
import { messageOf, request } from "@/lib/client-http";
import { CODE_HOSTS, type PullRequestStatus, type TicketPullRequest, type TicketPullRequests } from "@/lib/code-host-types";
import type { BoardSummary, TicketDetail } from "@/lib/ticket-types";
import { formatDateTime } from "@/features/tickets/ui";
import styles from "@/features/tickets/Tracker.module.css";

const STATUS: Record<PullRequestStatus, { label: string; tone: "action" | "done" | "neutral" }> = {
  OPEN: { label: "Open", tone: "action" }, MERGED: { label: "Merged", tone: "done" }, DECLINED: { label: "Declined", tone: "neutral" },
};

// The pull requests attached to a ticket. Hidden for projects with no linked repository.
export default function PullRequests({ ticket, board, canWrite, onMoved }: { ticket: TicketDetail; board: BoardSummary; canWrite: boolean; onMoved: (ticket: TicketDetail) => void }) {
  const [state, setState] = useState<TicketPullRequests | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<TicketPullRequests>(`/api/tickets/${ticket.id}/pull-requests`, { signal: controller.signal })
      .then(setState).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [ticket.id]);
  if (!state) return error ? <p role="alert" className={styles.error}>{error}</p> : null;
  if (!state.linkable && !state.pullRequests.length) return null;

  const done = board.columns.find(column => column.isDone);
  const isDone = board.columns.find(column => column.id === ticket.columnId)?.isDone;
  const merged = state.pullRequests.find(item => item.status === "MERGED");
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  };
  const attach = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await request<{ pullRequest: TicketPullRequest }>(`/api/tickets/${ticket.id}/pull-requests`, { method: "POST", body: JSON.stringify({ url }) });
      setState({ ...state, pullRequests: [result.pullRequest, ...state.pullRequests.filter(item => item.id !== result.pullRequest.id)] }); setUrl("");
    });
  };
  const detach = (item: TicketPullRequest) => run(async () => {
    await request(`/api/pull-requests/${item.id}`, { method: "DELETE" });
    setState({ ...state, pullRequests: state.pullRequests.filter(other => other.id !== item.id) });
  });
  const moveToDone = () => run(async () => {
    const result = await request<{ ticket: TicketDetail }>(`/api/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ columnId: done!.id }) });
    onMoved(result.ticket);
  });

  return <section className={styles.comments} aria-label="Pull requests">
    <h2>Pull requests <span>{state.pullRequests.length}</span></h2>
    {canWrite && merged && done && !isDone && <p role="status" className={styles.prompt}>
      #{merged.number} was merged. Move {ticket.key} to {done.name}? <Button type="button" variant="primary" disabled={busy} onClick={() => void moveToDone()}>Move to {done.name}</Button>
    </p>}
    {!state.pullRequests.length && <p className={styles.muted}>None yet. A pull request with {ticket.key} in its title or branch name appears here.</p>}
    <ul className={styles.pulls}>{state.pullRequests.map(item => <li key={item.id}>
      <GitPullRequest size={16} aria-hidden="true" />
      <div>
        <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
        <small>{CODE_HOSTS[item.repository.provider].label} · {item.repository.fullName} #{item.number}{item.branch ? ` · ${item.branch}` : ""}{item.author ? ` · ${item.author}` : ""} · updated {formatDateTime(item.updatedAt)}</small>
      </div>
      <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
      {canWrite && <button type="button" className={styles.iconButton} aria-label={`Remove pull request #${item.number} from ${ticket.key}`} disabled={busy} onClick={() => void detach(item)}><X size={15} /></button>}
    </li>)}</ul>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {canWrite && state.linkable && <form className={styles.pullForm} onSubmit={attach}>
      <Input type="url" required maxLength={300} value={url} onChange={event => setUrl(event.target.value)} aria-label="Pull request address" placeholder="Paste a pull request address to attach it" />
      <Button disabled={busy || !url.trim()}>{busy ? "Working…" : "Attach"}</Button>
    </form>}
  </section>;
}
