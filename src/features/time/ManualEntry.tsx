"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import type { TicketSummary } from "@/lib/ticket-types";
import type { TimeEntry } from "@/lib/time-types";
import { messageOf, request } from "@/lib/client-http";
import { localToday } from "../tickets/ui";
import { entrySeconds, formatDuration, localToIso } from "./calc";
import styles from "./Time.module.css";

// Time worked earlier, added by hand with a date, a start and an end.
export default function ManualEntry({ tickets, onAdded }: { tickets: TicketSummary[]; onAdded: () => void }) {
  const [form, setForm] = useState({ ticketId: "", date: localToday(), start: "09:00", end: "10:00", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [field]: event.target.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const startedAt = localToIso(form.date, form.start), endedAt = localToIso(form.date, form.end);
    if (!startedAt || !endedAt) { setError("Enter a date, a start time and an end time."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { entry } = await request<{ entry: TimeEntry }>("/api/time-entries", { method: "POST", body: JSON.stringify({ ticketId: form.ticketId, startedAt, endedAt, note: form.note }) });
      setForm({ ...form, note: "" });
      setNotice(`Added ${formatDuration(entrySeconds(entry, new Date()))} on ${entry.ticket.key}.`);
      onAdded();
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  return <form className={styles.manual} onSubmit={submit} aria-label="Add time manually">
    <h2>Add time</h2>
    <div className={styles.fields}>
      <label className={styles.wide}>Ticket<select required value={form.ticketId} onChange={set("ticketId")}>
        <option value="">Choose a ticket</option>
        {tickets.map(ticket => <option key={ticket.id} value={ticket.id}>{ticket.key} · {ticket.title}</option>)}
      </select></label>
      <label>Date<Input type="date" required value={form.date} max={localToday()} onChange={set("date")} /></label>
      <label>Start<Input type="time" required value={form.start} onChange={set("start")} /></label>
      <label>End<Input type="time" required value={form.end} onChange={set("end")} /></label>
      <label className={styles.wide}>Note (optional)<Input maxLength={500} value={form.note} onChange={set("note")} placeholder="What did you work on?" /></label>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><Button variant="primary" disabled={busy || !form.ticketId}><Plus size={14} /> {busy ? "Adding…" : "Add entry"}</Button><span role="status" className={styles.notice}>{notice}</span></div>
  </form>;
}
