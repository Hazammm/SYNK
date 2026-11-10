"use client";

import { useEffect, useState } from "react";
import { CheckCheck, ChevronDown, Play, Plus } from "lucide-react";
import { Avatar, Badge, Button, Input } from "@/components/Primitives";
import type { ProjectDetail, SprintSummary, TicketDetail, TicketSummary } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import TicketDrawer from "./TicketDrawer";
import { formatDate, initials, priorityOf, syncUrl, type Selection } from "./ui";
import styles from "./Tracker.module.css";

type Props = { project: ProjectDetail; userId: string; initial: Selection; onProjectChange: () => void };
const STATE_ORDER = { ACTIVE: 0, PLANNED: 1, COMPLETED: 2 };
const STATE_LABEL = { ACTIVE: "Active", PLANNED: "Planned", COMPLETED: "Completed" };

export default function SprintsView({ project, userId, initial, onProjectChange }: Props) {
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openTicket, setOpenTicket] = useState(initial.ticket ?? "");
  const [busy, setBusy] = useState("");
  const canWrite = project.level === "WRITE";
  const columns = new Map(project.boards.flatMap(board => board.columns.map(column => [column.id, column] as const)));
  const sprints = [...project.sprints].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.startDate < b.startDate ? -1 : 1));
  const openSprints = sprints.filter(sprint => sprint.state !== "COMPLETED");

  useEffect(() => {
    const controller = new AbortController();
    request<{ tickets: TicketSummary[] }>(`/api/tickets?projectId=${project.id}`, { signal: controller.signal })
      .then(result => { setTickets(result.tickets); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id, revision]);

  function show(ticketId: string) { setOpenTicket(ticketId); syncUrl({ ticket: ticketId || undefined }); }
  const replace = (ticket: TicketSummary) => setTickets(current => current?.map(item => item.id === ticket.id ? ticket : item) ?? null);
  async function act(id: string, action: () => Promise<void>) {
    setBusy(id); setError("");
    try { await action(); } catch (error) { setError(messageOf(error)); } finally { setBusy(""); }
  }
  const moveTicket = (ticket: TicketSummary, sprintId: string) => act(ticket.id, async () => {
    replace((await request<{ ticket: TicketDetail }>(`/api/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ sprintId: sprintId || null }) })).ticket);
  });
  const setState = (sprint: SprintSummary, state: "ACTIVE" | "COMPLETED", unfinished: number) => {
    if (state === "COMPLETED" && !window.confirm(unfinished
      ? `Complete ${sprint.name}? ${unfinished} unfinished ${unfinished === 1 ? "ticket returns" : "tickets return"} to the backlog. This cannot be undone.`
      : `Complete ${sprint.name}? This cannot be undone.`)) return;
    void act(sprint.id, async () => {
      await request(`/api/sprints/${sprint.id}`, { method: "PATCH", body: JSON.stringify({ state }) });
      // Completing moves tickets on the server, so reload both the sprint list and the tickets.
      onProjectChange(); setRevision(value => value + 1);
    });
  };

  const group = (sprint: SprintSummary | null) => {
    const rows = (tickets ?? []).filter(ticket => ticket.sprintId === (sprint?.id ?? null));
    const done = rows.filter(ticket => columns.get(ticket.columnId)?.isDone).length;
    const percent = rows.length ? Math.round(done / rows.length * 100) : 0;
    const title = sprint?.name ?? "Backlog";
    return <details key={sprint?.id ?? "backlog"} className={styles.sprint} open={sprint?.state !== "COMPLETED"}>
      <summary>
        <ChevronDown size={16} aria-hidden="true" /><h2>{title}</h2>
        {sprint ? <Badge tone={sprint.state === "ACTIVE" ? "action" : sprint.state === "COMPLETED" ? "done" : "neutral"}>{STATE_LABEL[sprint.state]}</Badge> : <Badge>Not in a sprint</Badge>}
        <span className={styles.muted}>{sprint && `${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)} · `}{rows.length} {rows.length === 1 ? "ticket" : "tickets"}</span>
      </summary>
      {sprint && <div className={styles.sprintInfo}>
        {sprint.goal && <p>{sprint.goal}</p>}
        <div className={styles.progressRow}>
          <div className={styles.progress} role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${done} of ${rows.length} tickets done`}><span style={{ width: `${percent}%` }} /></div>
          <span>{done} of {rows.length} done ({percent}%)</span>
          {canWrite && sprint.state === "PLANNED" && <Button disabled={busy === sprint.id} onClick={() => setState(sprint, "ACTIVE", 0)}><Play size={15} /> Start sprint</Button>}
          {canWrite && sprint.state === "ACTIVE" && <Button disabled={busy === sprint.id} onClick={() => setState(sprint, "COMPLETED", rows.length - done)}><CheckCheck size={15} /> Complete sprint</Button>}
        </div>
      </div>}
      {!rows.length && <p className={styles.sprintEmpty}>{sprint ? (sprint.state === "COMPLETED" ? "No tickets were completed in this sprint." : "No tickets yet. Move tickets here from the backlog.") : "Every ticket is in a sprint."}</p>}
      <ul className={styles.rows}>{rows.map(ticket => {
        const priority = priorityOf(ticket.priority), column = columns.get(ticket.columnId);
        return <li key={ticket.id}>
          <span className={styles.key}>{ticket.key}</span>
          <button type="button" className={styles.rowTitle} onClick={() => show(ticket.id)}>{ticket.title}</button>
          <Badge tone={column?.isDone ? "done" : "neutral"}>{column?.name ?? "Unknown"}</Badge>
          <Badge tone={priority.tone}>{priority.label}</Badge>
          {ticket.assignee ? <span title={`Assigned to ${ticket.assignee.name ?? "Member"}`}><span className={styles.srOnly}>Assigned to {ticket.assignee.name ?? "Member"}</span><Avatar small initials={initials(ticket.assignee.name)} /></span> : <span className={styles.unassigned}>Unassigned</span>}
          {canWrite && sprint?.state !== "COMPLETED" && <select aria-label={`Sprint for ${ticket.key}`} value={ticket.sprintId ?? ""} disabled={busy === ticket.id} onChange={event => void moveTicket(ticket, event.target.value)}>
            <option value="">Backlog</option>{openSprints.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>}
        </li>;
      })}</ul>
    </details>;
  };

  return <>
    <div className={styles.toolbar}>
      <span className={styles.summary} role="status">{tickets ? `${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"} in ${project.name}` : "Loading tickets…"}</span>
      {canWrite && <Button variant="primary" className={styles.pushRight} aria-expanded={creating} onClick={() => setCreating(!creating)}><Plus size={15} /> New sprint</Button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Reload</button></p>}
    {creating && <CreateSprint projectId={project.id} onCreated={() => { setCreating(false); onProjectChange(); }} />}
    <div className={styles.sprints}>
      {!sprints.length && !creating && <p className={styles.notice}>No sprints yet. {canWrite ? "Create a sprint, then move tickets into it from the backlog below." : "Tickets are listed in the backlog below."}</p>}
      {openSprints.map(group)}
      {group(null)}
      {sprints.filter(sprint => sprint.state === "COMPLETED").map(group)}
    </div>
    {openTicket && <TicketDrawer key={openTicket} target={{ ticketId: openTicket }} project={project} userId={userId} canWrite={canWrite} onClose={() => show("")} onSaved={replace} />}
  </>;
}

function CreateSprint({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/projects/${projectId}/sprints`, { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      onCreated();
    } catch (error) { setError(messageOf(error)); setBusy(false); }
  }
  return <form className={styles.panel} onSubmit={submit}>
    <h2>Create a sprint</h2>
    <div className={styles.fieldRow}>
      <label>Sprint name<Input name="name" autoFocus required maxLength={60} placeholder="e.g. Sprint 4" /></label>
      <label>Start date<Input name="startDate" type="date" required /></label>
      <label>End date<Input name="endDate" type="date" required /></label>
    </div>
    <label>Goal (optional)<Input name="goal" maxLength={240} placeholder="What should be true when this sprint ends?" /></label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <Button variant="primary" disabled={busy}>{busy ? "Creating…" : "Create sprint"}</Button>
  </form>;
}
