"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { WorkspaceSummary } from "@/lib/chat-types";
import type { ProjectSummary, TicketSummary } from "@/lib/ticket-types";
import { TIMER_CHANGED, type TimeEntry } from "@/lib/time-types";
import { messageOf, request } from "@/lib/client-http";
import { downloadCsv, fileSafe } from "../reports/download";
import { percent } from "../reports/calc";
import { syncUrl } from "../tickets/ui";
import { addDays, entrySeconds, formatDuration, hours, secondsByDay, startOfWeek, totalsBy, weekDays } from "./calc";
import ManualEntry from "./ManualEntry";
import TimerCard from "./TimerCard";
import WeekChart from "./WeekChart";
import report from "../tickets/Tracker.module.css";
import styles from "./Time.module.css";

type Selection = { workspaceId?: string; projectId?: string };

export default function TimeView({ initialWorkspaces, initial }: { initialWorkspaces: WorkspaceSummary[]; initial: Selection }) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaces.find(item => item.id === initial.workspaceId)?.id ?? initialWorkspaces[0]?.id ?? "");
  return <div className={report.tracker}>
    <div className={report.bar}>
      <div><span className={report.eyebrow}>TIME TRACKING</span><h1>Time</h1></div>
      <label className={report.picker}>Workspace<select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} disabled={!initialWorkspaces.length}>
        {!initialWorkspaces.length && <option value="">No workspaces yet</option>}
        {initialWorkspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </div>
    {workspaceId
      ? <Workspace key={workspaceId} workspaceId={workspaceId} initialProjectId={workspaceId === initial.workspaceId ? initial.projectId : undefined} />
      : <div className={report.empty}><Clock3 size={32} /><h2>Create a workspace first</h2><p>Time is logged on tickets inside a workspace&apos;s projects.</p><Link href="/chat">Go to chat</Link></div>}
  </div>;
}

function Workspace({ workspaceId, initialProjectId }: { workspaceId: string; initialProjectId?: string }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<{ projects: ProjectSummary[] }>(`/api/workspaces/${workspaceId}/projects`, { signal: controller.signal }).then(result => {
      const open = result.projects.filter(project => project.level);
      setProjects(open); setError("");
      setProjectId(current => open.some(project => project.id === current) ? current : open[0]?.id ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [workspaceId]);
  useEffect(() => { if (projects) syncUrl({ workspaceId, projectId }); }, [workspaceId, projectId, projects]);
  const project = projects?.find(item => item.id === projectId);

  if (error) return <p role="alert" className={report.error}>{error}</p>;
  if (!projects) return <p role="status" className={report.loading}>Loading projects…</p>;
  if (!project) return <div className={report.empty}><Clock3 size={32} /><h2>No projects to log time on yet</h2><p>Create a project on the board, or ask a workspace admin for access to one.</p><Link href={`/board?workspaceId=${workspaceId}`}>Go to the board</Link></div>;
  return <>
    <div className={report.subnav}>
      <label className={report.picker}>Project<select value={project.id} onChange={event => setProjectId(event.target.value)}>
        {projects.map(item => <option key={item.id} value={item.id}>{item.name} ({item.key})</option>)}
      </select></label>
    </div>
    <ProjectTime key={project.id} project={project} />
  </>;
}

function ProjectTime({ project }: { project: ProjectSummary }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const canLog = project.level === "WRITE";
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const range = new URLSearchParams({ projectId: project.id, from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString() });
    Promise.all([
      request<{ entries: TimeEntry[] }>(`/api/time-entries?${range}`, { signal: controller.signal }),
      request<{ entry: TimeEntry | null }>("/api/time-entries/active", { signal: controller.signal }),
    ]).then(([list, timer]) => { setEntries(list.entries); setActive(timer.entry); setNow(new Date()); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id, weekStart, revision]);
  useEffect(() => {
    const controller = new AbortController();
    request<{ tickets: TicketSummary[] }>(`/api/tickets?projectId=${project.id}`, { signal: controller.signal })
      .then(result => setTickets(result.tickets)).catch(() => { if (!controller.signal.aborted) setTickets([]); });
    return () => controller.abort();
  }, [project.id]);
  // Running entries keep growing in the totals; a minute is precise enough there.
  useEffect(() => {
    if (!entries?.some(entry => !entry.endedAt)) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [entries]);
  useEffect(() => {
    window.addEventListener(TIMER_CHANGED, reload);
    return () => window.removeEventListener(TIMER_CHANGED, reload);
  }, [reload]);

  const shown = useMemo(() => (entries ?? []).filter(entry => !onlyMine || entry.mine), [entries, onlyMine]);
  const perDay = secondsByDay(shown, days, now);
  const total = perDay.reduce((sum, value) => sum + value, 0);
  const byTicket = totalsBy(shown, entry => entry.ticket.id, entry => `${entry.ticket.key} · ${entry.ticket.title}`, now);
  const byPerson = totalsBy(shown, entry => entry.user.id, entry => entry.user.name ?? "Member", now);
  const thisWeek = weekStart.getTime() === startOfWeek(new Date()).getTime();
  const range = `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  async function remove(entry: TimeEntry) {
    if (!window.confirm(`Delete ${formatDuration(entrySeconds(entry, now))} logged on ${entry.ticket.key}?`)) return;
    try { await request(`/api/time-entries/${entry.id}`, { method: "DELETE" }); reload(); } catch (error) { setError(messageOf(error)); }
  }
  const exportCsv = () => downloadCsv(`synk-time-${fileSafe(project.key)}-${days[0].toLocaleDateString("en-CA")}.csv`, [
    ["Date", "Person", "Ticket", "Title", "Start", "End", "Hours", "Note"],
    ...[...shown].reverse().map(entry => [
      new Date(entry.startedAt).toLocaleDateString("en-CA"), entry.user.name ?? "Member", entry.ticket.key, entry.ticket.title,
      new Date(entry.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "running",
      hours(entrySeconds(entry, now)), entry.note,
    ]),
  ]);

  return <div className={report.report}>
    <TimerCard active={active} tickets={tickets} canLog={canLog} onChanged={reload} />
    <div className={styles.weekBar}>
      <div className={styles.weekNav}>
        <Button variant="quiet" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></Button>
        <strong>{range}</strong>
        <Button variant="quiet" aria-label="Next week" disabled={thisWeek} onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></Button>
        {!thisWeek && <Button variant="quiet" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>}
      </div>
      <div className={styles.scope} role="radiogroup" aria-label="Whose time">
        {([false, true] as const).map(mine => <button key={String(mine)} type="button" role="radio" aria-checked={onlyMine === mine} onClick={() => setOnlyMine(mine)}>{mine ? "Just me" : "Everyone"}</button>)}
      </div>
      <Button className={report.pushRight} onClick={exportCsv} disabled={!shown.length}><Download size={15} /> Export CSV</Button>
    </div>
    {error && <p role="alert" className={report.error}>{error} <button type="button" onClick={reload}>Retry</button></p>}
    {!entries && !error && <p role="status" className={report.loading}>Loading time…</p>}
    {entries && <>
      <dl className={report.stats}>{[
        ["Logged this week", formatDuration(total), onlyMine ? "by you" : "by everyone"],
        ["Entries", String(shown.length), shown.length === 1 ? "time entry" : "time entries"],
        ["Tickets", String(byTicket.length), "with time logged"],
        ["Busiest day", total ? days[perDay.indexOf(Math.max(...perDay))].toLocaleDateString(undefined, { weekday: "long" }) : "—", total ? formatDuration(Math.max(...perDay)) : "nothing logged yet"],
      ].map(([label, value, note]) => <div className={report.stat} key={label}><dt>{label}</dt><dd><strong>{value}</strong><small>{note}</small></dd></div>)}</dl>
      <div className={report.reportGrid}>
        <section className={report.chartCard} aria-labelledby="per-day-title">
          <h2 id="per-day-title">Hours per day</h2><p>{onlyMine ? "Your time" : "Everyone's time"} in {project.name}</p>
          <WeekChart days={days} seconds={perDay} />
        </section>
        <section className={report.chartCard} aria-labelledby="per-ticket-title">
          <h2 id="per-ticket-title">By ticket</h2>
          <Breakdown rows={byTicket} total={total} empty="No time logged on tickets this week." />
          {!onlyMine && <><h2>By person</h2><Breakdown rows={byPerson} total={total} empty="Nobody has logged time this week." /></>}
        </section>
      </div>
      <div className={report.reportGrid}>
        <section className={report.chartCard} aria-labelledby="entries-title">
          <h2 id="entries-title">Entries</h2>
          {shown.length ? <div className={report.tableWrap}><table className={report.table}>
            <thead><tr><th scope="col">Date</th><th scope="col">Ticket</th>{!onlyMine && <th scope="col">Person</th>}<th scope="col">Time</th><th scope="col">Duration</th><th scope="col"><span className={report.srOnly}>Actions</span></th></tr></thead>
            <tbody>{shown.map(entry => <tr key={entry.id}>
              <td>{new Date(entry.startedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</td>
              <td><span className={report.key}>{entry.ticket.key}</span> {entry.ticket.title}{entry.note && <small className={styles.note}>{entry.note}</small>}</td>
              {!onlyMine && <td>{entry.user.name ?? "Member"}</td>}
              <td>{new Date(entry.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – {entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "now"}</td>
              <td>{formatDuration(entrySeconds(entry, now))}{!entry.endedAt && <span className={styles.live}> running</span>}</td>
              <td>{entry.mine && entry.endedAt && <button type="button" className={styles.delete} aria-label={`Delete time on ${entry.ticket.key}`} onClick={() => void remove(entry)}><Trash2 size={14} /></button>}</td>
            </tr>)}</tbody>
          </table></div> : <p>No time logged {onlyMine ? "by you " : ""}this week.</p>}
        </section>
        {canLog && tickets && <section className={report.chartCard}><ManualEntry tickets={tickets} onAdded={reload} /></section>}
      </div>
    </>}
  </div>;
}

function Breakdown({ rows, total, empty }: { rows: { key: string; label: string; seconds: number }[]; total: number; empty: string }) {
  if (!rows.length) return <p>{empty}</p>;
  return <ul className={report.breakdown}>{rows.map(row => <li key={row.key}>
    <span>{row.label}</span><strong>{formatDuration(row.seconds)}</strong>
    <div className={report.meter} aria-hidden="true"><span style={{ width: `${percent(row.seconds, total)}%` }} /></div>
  </li>)}</ul>;
}
