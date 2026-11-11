"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/Primitives";
import type { WorkspaceSummary } from "@/lib/chat-types";
import type { Overview } from "@/lib/report-types";
import { messageOf, request } from "@/lib/client-http";
import { percent } from "../reports/calc";
import { formatDate, localToday, priorityOf, trackerHref } from "../tickets/ui";
import styles from "../tickets/Tracker.module.css";

const DAY_MS = 86_400_000;

export default function OverviewView({ userName, initialWorkspaces, initialWorkspaceId }: { userName: string; initialWorkspaces: WorkspaceSummary[]; initialWorkspaceId?: string }) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaces.find(item => item.id === initialWorkspaceId)?.id ?? initialWorkspaces[0]?.id ?? "");
  const [loaded, setLoaded] = useState<{ workspaceId: string; overview: Overview } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [today] = useState(localToday);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    request<{ overview: Overview }>(`/api/workspaces/${workspaceId}/overview`, { signal: controller.signal })
      .then(result => { setLoaded({ workspaceId, overview: result.overview }); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [workspaceId, revision]);
  // Never show one workspace's numbers under another workspace's name while the next request is in flight.
  const overview = loaded?.workspaceId === workspaceId ? loaded.overview : null;

  return <div className={styles.tracker}>
    <div className={styles.bar}>
      <div><span className={styles.eyebrow}>OVERVIEW</span><h1>Welcome back, {userName.split(" ")[0]}</h1></div>
      <label className={styles.picker}>Workspace<select value={workspaceId} onChange={event => { setWorkspaceId(event.target.value); setError(""); }} disabled={!initialWorkspaces.length}>
        {!initialWorkspaces.length && <option value="">No workspaces yet</option>}
        {initialWorkspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </div>
    {!workspaceId && <div className={styles.empty}><LayoutDashboard size={32} /><h2>Create a workspace first</h2><p>Your tickets and sprints appear here once you belong to a workspace. Create one in chat, or ask an admin to add you.</p><Link href="/chat">Go to chat</Link></div>}
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
    {workspaceId && !overview && !error && <p role="status" className={styles.loading}>Loading your overview…</p>}
    {overview && !error && <div className={styles.report}>
      <dl className={styles.stats}>{[
        ["Assigned to you", overview.stats.assignedOpen, overview.stats.assignedOpen === 1 ? "open ticket" : "open tickets"],
        ["Overdue", overview.stats.overdue, overview.stats.overdue ? "past their due date" : "nothing is late"],
        ["Completed", overview.stats.completedThisWeek, "by you in the last 7 days"],
        ["Projects", overview.stats.projects, "you can open here"],
      ].map(([label, value, note]) => <div className={styles.stat} key={label}><dt>{label}</dt><dd><strong>{value}</strong><small>{note}</small></dd></div>)}</dl>
      <div className={styles.reportGrid}>
        <section className={styles.chartCard} aria-labelledby="my-tickets-title">
          <h2 id="my-tickets-title">Your open tickets</h2>
          {overview.tickets.length ? <>
            <ul className={`${styles.rows} ${styles.flushRows}`}>{overview.tickets.map(ticket => {
              const priority = priorityOf(ticket.priority), late = Boolean(ticket.dueDate && ticket.dueDate < today);
              return <li key={ticket.id}>
                <span className={styles.key}>{ticket.key}</span>
                <Link className={styles.rowTitle} href={trackerHref("board", { workspaceId, projectId: ticket.projectId, boardId: ticket.boardId, ticket: ticket.id })}>{ticket.title}</Link>
                {ticket.dueDate && <span className={styles.due} data-overdue={late}><CalendarDays size={13} aria-hidden="true" /> {late ? "Overdue, due" : "Due"} {formatDate(ticket.dueDate)}</span>}
                <Badge>{ticket.status}</Badge><Badge tone={priority.tone}>{priority.label}</Badge>
              </li>;
            })}</ul>
            {overview.stats.assignedOpen > overview.tickets.length && <p>Showing the {overview.tickets.length} most urgent of {overview.stats.assignedOpen}.</p>}
          </> : <p>{overview.stats.projects ? "Nothing is assigned to you right now." : "You do not have access to a project in this workspace yet. Ask a workspace admin for access."}</p>}
        </section>
        <section className={styles.chartCard} aria-labelledby="active-sprints-title">
          <h2 id="active-sprints-title">Active sprints</h2>
          {overview.sprints.length ? <ul className={styles.breakdown}>{overview.sprints.map(sprint => {
            const daysLeft = Math.max(0, Math.round((Date.parse(sprint.endDate) - Date.parse(today)) / DAY_MS) + 1), done = percent(sprint.completed, sprint.total);
            return <li key={sprint.id}>
              <span><Link href={trackerHref("reports", { workspaceId, projectId: sprint.project.id, sprintId: sprint.id })}>{sprint.name}</Link><small> · {sprint.project.name}</small></span>
              <strong>{sprint.completed} of {sprint.total}<small> done</small></strong>
              <div className={styles.meter} role="progressbar" aria-label={`${sprint.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={done}><span data-done="true" style={{ width: `${done}%` }} /></div>
              <small>{daysLeft === 0 ? "Ended" : daysLeft === 1 ? "Last day" : `${daysLeft} days left`} · ends {formatDate(sprint.endDate)}</small>
            </li>;
          })}</ul> : <p>No sprint is running in your projects.</p>}
        </section>
      </div>
    </div>}
  </div>;
}
