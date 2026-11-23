"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtSign, CheckCheck, MessageSquare, MessagesSquare, SmilePlus, UserPlus } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { NotificationItem, NotificationType } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import { NOTIFICATIONS_CHANGED } from "@/lib/events";
import { formatDateTime, trackerHref } from "@/features/tickets/ui";
import styles from "@/features/tickets/Tracker.module.css";

const KINDS: Record<NotificationType, { icon: React.ReactNode; verb: string }> = {
  TICKET_ASSIGNED: { icon: <UserPlus size={16} />, verb: "assigned you" },
  TICKET_MENTION: { icon: <AtSign size={16} />, verb: "mentioned you on" },
  TICKET_COMMENT: { icon: <MessageSquare size={16} />, verb: "commented on" },
  CHAT_MENTION: { icon: <AtSign size={16} />, verb: "mentioned you in" },
  CHAT_REPLY: { icon: <MessagesSquare size={16} />, verb: "replied to a thread in" },
  CHAT_REACTION: { icon: <SmilePlus size={16} />, verb: "reacted to your message in" },
};
type Filter = "all" | "unread" | "mentions" | "threads" | "reactions" | "tickets";
const FILTERS: { id: Filter; label: string; match: (item: NotificationItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "unread", label: "Unread", match: item => !item.read },
  { id: "mentions", label: "Mentions", match: item => item.type === "CHAT_MENTION" || item.type === "TICKET_MENTION" },
  { id: "threads", label: "Threads", match: item => item.type === "CHAT_REPLY" },
  { id: "reactions", label: "Reactions", match: item => item.type === "CHAT_REACTION" },
  { id: "tickets", label: "Tickets", match: item => item.ticket !== null },
];

// Where an alert leads, and how it reads: "Asra mentioned you in #general".
function describe(item: NotificationItem) {
  const who = item.actor?.name ?? "Someone";
  if (item.ticket) {
    return {
      href: trackerHref("board", { workspaceId: item.ticket.workspaceId, projectId: item.ticket.projectId, boardId: item.ticket.boardId, ticket: item.ticket.id }),
      text: `${who} ${KINDS[item.type].verb} ${item.ticket.key} · ${item.ticket.title}`,
    };
  }
  const message = item.message!;
  const where = message.direct ? "a direct message" : `#${message.channelName}`;
  const text = item.type === "CHAT_MENTION" && message.direct ? `${who} sent you a message` : `${who} ${KINDS[item.type].verb} ${where}`;
  return { href: `/w/${message.workspaceId}/chat/${message.channelId}?message=${message.id}`, text };
}

type Reminder = { id: string; text: string; dueAt: string; firedAt: string | null; messageId: string | null; channelId: string | null; place: string | null };

export default function AlertsList({ workspaceId }: { workspaceId?: string }) {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<{ notifications: NotificationItem[] }>("/api/notifications", { signal: controller.signal })
      .then(result => { setItems(result.notifications); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [revision]);
  // New alerts arriving while the page is open show up straight away.
  useEffect(() => {
    const reload = () => setRevision(value => value + 1);
    window.addEventListener(NOTIFICATIONS_CHANGED, reload);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, reload);
  }, []);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    request<{ reminders: Reminder[] }>(`/api/workspaces/${workspaceId}/reminders`, { signal: controller.signal })
      .then(result => setReminders(result.reminders)).catch(() => setReminders([]));
    return () => controller.abort();
  }, [workspaceId, revision]);
  const unread = items?.filter(item => !item.read).length ?? 0;
  const shown = items?.filter(FILTERS.find(entry => entry.id === filter)!.match) ?? [];

  async function markRead(ids?: string[]) {
    setItems(current => current?.map(item => !ids || ids.includes(item.id) ? { ...item, read: true } : item) ?? null);
    try {
      await request("/api/notifications", { method: "PATCH", body: JSON.stringify(ids ? { ids } : {}) });
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    } catch (error) { setError(messageOf(error)); setRevision(value => value + 1); }
  }

  return <div className={styles.tracker}>
    <div className={styles.alerts}>
      <div className={styles.pageHead}>
        <div><h1>Alerts</h1><p>Mentions, direct messages, thread replies and reactions in chat, and activity on your tickets.</p></div>
        <Button disabled={!unread} onClick={() => void markRead()}><CheckCheck size={15} /> Mark all as read</Button>
      </div>
      <div className={styles.chips} role="group" aria-label="Filter alerts">
        {FILTERS.map(entry => <button key={entry.id} type="button" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
          {entry.label}{entry.id === "unread" && unread ? ` (${unread})` : ""}
        </button>)}
      </div>
      {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
      {!items && !error && <p role="status" className={styles.loading}>Loading alerts…</p>}
      {items && !shown.length && <div className={styles.empty}><CheckCheck size={32} /><h2>{filter !== "all" && items.length ? "Nothing here" : "No alerts yet"}</h2><p>You will be notified here when someone mentions you, messages you, replies to your thread, reacts to your message, or assigns you a ticket.</p></div>}
      {reminders && reminders.length > 0 && <section className={styles.reminders}>
        <h2>Reminders</h2>
        <ul>{reminders.map(item => {
          const href = item.channelId && item.messageId && workspaceId ? `/w/${workspaceId}/chat/${item.channelId}?message=${item.messageId}` : "";
          return <li key={item.id}>
            {href ? <Link href={href}>{item.text}</Link> : <span>{item.text}</span>}
            <time dateTime={item.dueAt}>{formatDateTime(item.dueAt)}{item.firedAt ? " · sent" : ""}{item.place ? ` · ${item.place}` : ""}</time>
            {!item.firedAt && <Button type="button" variant="quiet" onClick={() => void request(`/api/reminders/${item.id}`, { method: "DELETE" }).then(() => setRevision(value => value + 1))}>Cancel</Button>}
          </li>;
        })}</ul>
      </section>}
      {shown.length > 0 && <ul>{shown.map(item => {
        const { href, text } = describe(item);
        return <li key={item.id}>
          <Link href={href} className={styles.alert} data-unread={!item.read} onClick={() => { if (!item.read) void markRead([item.id]); }}>
            <span aria-hidden="true">{KINDS[item.type].icon}</span>
            <div>
              <p>{!item.read && <span className={styles.srOnly}>Unread: </span>}{text}</p>
              {item.excerpt && <p>“{item.excerpt}”</p>}
              <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
            </div>
            {!item.read && <i className={styles.unreadDot} aria-hidden="true" />}
          </Link>
        </li>;
      })}</ul>}
    </div>
  </div>;
}
