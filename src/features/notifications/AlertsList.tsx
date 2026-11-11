"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtSign, CheckCheck, MessageSquare, UserPlus } from "lucide-react";
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
};

export default function AlertsList() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<{ notifications: NotificationItem[] }>("/api/notifications", { signal: controller.signal })
      .then(result => { setItems(result.notifications); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [revision]);
  const unread = items?.filter(item => !item.read).length ?? 0;
  const shown = items?.filter(item => !unreadOnly || !item.read) ?? [];

  async function markRead(ids?: string[]) {
    setItems(current => current?.map(item => !ids || ids.includes(item.id) ? { ...item, read: true } : item) ?? null);
    try {
      await request("/api/notifications", { method: "PATCH", body: JSON.stringify(ids ? { ids } : {}) });
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    } catch (error) { setError(messageOf(error)); setRevision(value => value + 1); }
  }

  return <div className={styles.tracker}>
    <div className={styles.alerts}>
      <div className={styles.bar} style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div><span className={styles.eyebrow}>NOTIFICATIONS</span><h1>Alerts</h1></div>
        <Button className={styles.pushRight} disabled={!unread} onClick={() => void markRead()}><CheckCheck size={15} /> Mark all as read</Button>
      </div>
      <div className={styles.chips} role="group" aria-label="Filter alerts">
        <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button>
        <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread{unread ? ` (${unread})` : ""}</button>
      </div>
      {error && <p role="alert" className={styles.error} style={{ marginLeft: 0, marginRight: 0 }}>{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
      {!items && !error && <p role="status" className={styles.loading}>Loading alerts…</p>}
      {items && !shown.length && <div className={styles.empty}><CheckCheck size={32} /><h2>{unreadOnly && items.length ? "You are all caught up" : "No alerts yet"}</h2><p>You will be notified here when someone assigns you a ticket, mentions you, or comments on a ticket assigned to you.</p></div>}
      {shown.length > 0 && <ul>{shown.map(item => {
        const kind = KINDS[item.type];
        const href = trackerHref("board", { workspaceId: item.ticket.workspaceId, projectId: item.ticket.projectId, boardId: item.ticket.boardId, ticket: item.ticket.id });
        return <li key={item.id}>
          <Link href={href} className={styles.alert} data-unread={!item.read} onClick={() => { if (!item.read) void markRead([item.id]); }}>
            <span aria-hidden="true">{kind.icon}</span>
            <div>
              <p>{!item.read && <span className={styles.srOnly}>Unread: </span>}{item.actor?.name ?? "Someone"} {kind.verb} {item.ticket.key} · {item.ticket.title}</p>
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
