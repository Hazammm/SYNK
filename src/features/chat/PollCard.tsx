"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import type { ChatPoll } from "@/lib/chat-types";
import { messageOf, request } from "@/lib/client-http";
import styles from "./Chat.module.css";

export default function PollCard({ poll, viewerId }: { poll: ChatPoll; viewerId: string }) {
  const [picked, setPicked] = useState<string[]>(() => poll.options.filter(option => option.userIds.includes(viewerId)).map(option => option.id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = poll.options.reduce((sum, option) => sum + option.count, 0);

  const toggle = (id: string) => {
    setPicked(current => poll.multiSelect ? (current.includes(id) ? current.filter(item => item !== id) : [...current, id]) : [id]);
  };

  const vote = async () => {
    if (!picked.length || poll.closed) return;
    setBusy(true); setError("");
    try {
      await request(`/api/polls/${poll.id}/vote`, { method: "POST", body: JSON.stringify({ optionIds: picked }) });
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  };

  return <div className={styles.pollCard}>
    <strong><BarChart3 size={14} aria-hidden="true" /> {poll.question}</strong>
    <ul>
      {poll.options.map(option => {
        const pct = total ? Math.round((option.count / total) * 100) : 0;
        return <li key={option.id}>
          <label>
            <input type={poll.multiSelect ? "checkbox" : "radio"} name={`poll-${poll.id}`} checked={picked.includes(option.id)} disabled={poll.closed} onChange={() => toggle(option.id)} />
            <span>{option.label}</span>
            <em>{option.count} · {pct}%</em>
          </label>
          <i style={{ width: `${pct}%` }} />
        </li>;
      })}
    </ul>
    <div className={styles.pollMeta}>
      <small>{total} {total === 1 ? "vote" : "votes"}{poll.multiSelect ? " · multiple choice" : ""}{poll.closed ? " · closed" : ""}</small>
      {!poll.closed && <button type="button" disabled={busy || !picked.length} onClick={() => void vote()}>Vote</button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
