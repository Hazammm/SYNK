"use client";

import { useEffect, useState } from "react";
import { Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { TicketSummary } from "@/lib/ticket-types";
import type { TimeEntry, TimerStart } from "@/lib/time-types";
import { messageOf, request } from "@/lib/client-http";
import { entrySeconds, formatClock, formatDuration } from "./calc";
import styles from "./Time.module.css";

// The person's running timer, or a picker to start one on a ticket in the selected project.
export default function TimerCard({ active, tickets, canLog, onChanged }: { active: TimeEntry | null; tickets: TicketSummary[] | null; canLog: boolean; onChanged: () => void }) {
  const [ticketId, setTicketId] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  async function run(action: () => Promise<string>) {
    setBusy(true); setError(""); setNotice("");
    try { setNotice(await action()); onChanged(); } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  const start = () => void run(async () => {
    const { stopped } = await request<TimerStart>("/api/time-entries/start", { method: "POST", body: JSON.stringify({ ticketId }) });
    setTicketId("");
    return stopped ? `Stopped ${stopped.ticket.key} after ${formatDuration(entrySeconds(stopped, new Date()))} and started the new timer.` : "Timer started.";
  });
  const stop = () => void run(async () => {
    const { entry } = await request<{ entry: TimeEntry }>("/api/time-entries/stop", { method: "POST" });
    return `Logged ${formatDuration(entrySeconds(entry, new Date()))} on ${entry.ticket.key}.`;
  });

  return <section className={styles.timer} aria-label="Timer" data-running={Boolean(active)}>
    <span className={styles.timerIcon} aria-hidden="true"><Timer size={19} /></span>
    {active ? <>
      <div className={styles.timerText}><span className={styles.eyebrow}>TRACKING</span><strong>{active.ticket.key} · {active.ticket.title}</strong>
        <small>Started {new Date(active.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</small></div>
      <output className={styles.clock} aria-label="Elapsed time">{formatClock(entrySeconds(active, now))}</output>
      <Button variant="primary" disabled={busy} onClick={stop}><Square size={14} /> Stop</Button>
    </> : <>
      <div className={styles.timerText}><span className={styles.eyebrow}>NO TIMER RUNNING</span><strong>Start a timer on a ticket</strong></div>
      {canLog ? <>
        <select aria-label="Ticket to time" value={ticketId} onChange={event => setTicketId(event.target.value)} disabled={!tickets?.length}>
          <option value="">{tickets ? tickets.length ? "Choose a ticket" : "No tickets in this project" : "Loading tickets…"}</option>
          {tickets?.map(ticket => <option key={ticket.id} value={ticket.id}>{ticket.key} · {ticket.title}</option>)}
        </select>
        <Button variant="primary" disabled={busy || !ticketId} onClick={start}><Play size={14} /> Start</Button>
      </> : <small className={styles.muted}>You have view-only access to this project, so you can&apos;t log time here.</small>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status" className={styles.notice}>{notice}</p>
  </section>;
}
