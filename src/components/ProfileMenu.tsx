"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { Bell, BellOff, ChevronRight, LogOut, Settings, Smile, UserRound, X } from "lucide-react";
import { isPaused, type Account, type PersonStatus } from "@/lib/account-types";
import { messageOf, request } from "@/lib/client-http";
import { ACCOUNT_CHANGED, STATUS_CHANGED } from "@/lib/events";
import { clearTime } from "@/features/account/PersonalSettings";
import { Avatar } from "./Primitives";
import styles from "./ProfileMenu.module.css";

export const initialsOf = (name: string | null | undefined) =>
  (name?.trim() || "Member").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

// Slack's one-click statuses, each clearing itself after a sensible time.
const PRESETS = [
  { emoji: "📅", text: "In a meeting", clears: "1h", label: "1 hour" },
  { emoji: "🚌", text: "Commuting", clears: "30m", label: "30 minutes" },
  { emoji: "🤒", text: "Out sick", clears: "today", label: "Today" },
  { emoji: "🌴", text: "Vacationing", clears: "week", label: "This week" },
  { emoji: "🏠", text: "Working remotely", clears: "today", label: "Today" },
];
const EMOJIS = ["💬", "🎯", "☕", "🍔", "🎧", "🔥", "✅", "🤔", "🚀", "💻", "🧘", "😴"];

// Slack's "Pause notifications" choices. Tomorrow and next week resume at 9:00.
const at9 = (date: Date) => { date.setHours(9, 0, 0, 0); return date; };
const PAUSES: Array<{ label: string; end: (now: number) => Date }> = [
  { label: "For 30 minutes", end: now => new Date(now + 30 * 60_000) },
  { label: "For 1 hour", end: now => new Date(now + 60 * 60_000) },
  { label: "For 2 hours", end: now => new Date(now + 120 * 60_000) },
  { label: "Until tomorrow", end: now => { const day = new Date(now); day.setDate(day.getDate() + 1); return at9(day); } },
  { label: "Until next week", end: now => { const day = new Date(now); day.setDate(day.getDate() + (((8 - day.getDay()) % 7) || 7)); return at9(day); } },
];
const untilLabel = (iso: string) => {
  const date = new Date(iso), today = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === today.toDateString() ? time : `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
};
// The value for a datetime-local input, in the browser's time zone.
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

// The signed-in person in the bottom corner of the sidebar, like Slack: photo with a presence dot and status emoji.
// It opens upward with status, away and profile shortcuts.
export default function ProfileMenu({ userName, settingsHref = "/settings", compact = false }: { userName: string; settingsHref?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ left: 0, bottom: 0 });
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ emoji: "💬", text: "" });
  const [busy, setBusy] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [custom, setCustom] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const reload = () => setRevision(value => value + 1);
    window.addEventListener(ACCOUNT_CHANGED, reload);
    return () => window.removeEventListener(ACCOUNT_CHANGED, reload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request<{ account: Account }>("/api/me", { signal: controller.signal })
      .then(result => { setAccount(result.account); setError(""); })
      .catch(cause => { if (!controller.signal.aborted) setError(messageOf(cause)); });
    if (!open) return () => controller.abort();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !card.current?.contains(target)) { setOpen(false); setEditing(false); setPauseOpen(false); }
    };
    document.addEventListener("mousedown", outside);
    return () => { controller.abort(); document.removeEventListener("mousedown", outside); };
  }, [open, revision]);

  // The rail slides on phones, so the card is placed on the page: beside a compact avatar, above a full-width button.
  const toggle = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPlace(compact
      ? { left: Math.max(8, Math.min(rect.right + 10, window.innerWidth - 308)), bottom: Math.max(8, window.innerHeight - rect.bottom) }
      : { left: Math.max(8, Math.min(rect.left, window.innerWidth - 308)), bottom: window.innerHeight - rect.top + 8 });
    setOpen(!open);
    setEditing(false);
    setPauseOpen(false);
  };

  const status = account?.status;
  const name = account?.name || userName;
  const active = !status?.away;
  const paused = isPaused(status);
  const close = () => { setOpen(false); setEditing(false); setPauseOpen(false); trigger.current?.focus(); };

  const announce = (next: PersonStatus) => {
    setAccount(current => current && { ...current, status: next, notificationsPausedUntil: next.pausedUntil });
    if (account) window.dispatchEvent(new CustomEvent(STATUS_CHANGED, { detail: { userId: account.id, status: next } }));
  };

  async function pause(until: Date | null) {
    setBusy(true); setError("");
    try {
      const result = await request<{ status: PersonStatus }>("/api/me/pause", { method: "PUT", body: JSON.stringify({ until: until?.toISOString() ?? null }) });
      announce(result.status);
      setPauseOpen(false);
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }

  async function saveStatus(next: Partial<PersonStatus>) {
    if (!status) return;
    setBusy(true); setError("");
    try {
      const body = { text: status.text, emoji: status.emoji, expiresAt: status.expiresAt, away: status.away, ...next };
      const result = await request<{ status: PersonStatus }>("/api/me/status", { method: "PUT", body: JSON.stringify(body) });
      announce(result.status);
      setEditing(false);
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }

  const hasStatus = Boolean(status?.text || status?.emoji);
  const subtitle = status?.text || (paused ? "Notifications paused" : active ? "Active" : "Away");
  const escape = (event: React.KeyboardEvent) => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } };
  return <div ref={root} className={styles.root} data-compact={compact} onKeyDown={escape}>
    <button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-haspopup="dialog" aria-controls="profile-card" onClick={toggle} title={name} aria-label={compact ? `${name}, ${subtitle}` : undefined}>
      <Avatar small initials={initialsOf(name)} src={account?.profile.image ?? undefined} online={active} paused={paused} />
      {!compact && <span className={styles.name}>
        <strong>{name}</strong>
        <small>{subtitle}</small>
      </span>}
      {status?.emoji && <span className={styles.badge} aria-label={status.text || "Status"}>{status.emoji}</span>}
    </button>

    {open && createPortal(<div ref={card} id="profile-card" role="dialog" aria-label="Your profile" className={styles.card} style={place} onKeyDown={escape}>
      <div className={styles.identity}>
        <Avatar initials={initialsOf(name)} src={account?.profile.image ?? undefined} online={active} paused={paused} />
        <div>
          <strong>{name}</strong>
          <span className={styles.presence}><i data-active={active} aria-hidden="true" /> {active ? "Active" : "Away"}{paused && " · Notifications paused"}</span>
        </div>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!account && !error && <p role="status" className={styles.muted}>Loading your profile…</p>}

      {account && <>
        {editing ? <form className={styles.statusForm} onSubmit={event => { event.preventDefault(); void saveStatus({ emoji: draft.emoji, text: draft.text.trim(), expiresAt: null }); }}>
          <div className={styles.emojiRow} role="group" aria-label="Status emoji">
            {EMOJIS.map(emoji => <button key={emoji} type="button" aria-pressed={draft.emoji === emoji} onClick={() => setDraft({ ...draft, emoji })}>{emoji}</button>)}
          </div>
          <label className={styles.statusInput}>
            <span aria-hidden="true">{draft.emoji}</span>
            <input autoFocus maxLength={100} value={draft.text} onChange={event => setDraft({ ...draft, text: event.target.value })} placeholder="What's your status?" aria-label="Status text" />
          </label>
          <div className={styles.formActions}>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className={styles.primary} disabled={busy}>Save</button>
          </div>
        </form> : <>
          <div className={styles.statusBox}>
            <button type="button" className={styles.statusButton} onClick={() => { setDraft({ emoji: status?.emoji || "💬", text: status?.text ?? "" }); setEditing(true); }}>
              <span aria-hidden="true">{status?.emoji || <Smile size={16} />}</span>
              <span>{hasStatus ? status?.text || "Status set" : "Update your status"}</span>
            </button>
            {hasStatus && <button type="button" className={styles.clear} aria-label="Clear status" disabled={busy} onClick={() => void saveStatus({ text: "", emoji: "", expiresAt: null })}><X size={14} /></button>}
          </div>
          {!hasStatus && <ul className={styles.presets} aria-label="Quick statuses">
            {PRESETS.map(preset => <li key={preset.text}>
              <button type="button" disabled={busy} onClick={() => void saveStatus({ emoji: preset.emoji, text: preset.text, expiresAt: clearTime(preset.clears) })}>
                <span aria-hidden="true">{preset.emoji}</span> {preset.text} <small>— {preset.label}</small>
              </button>
            </li>)}
          </ul>}
        </>}

        <button type="button" className={styles.item} disabled={busy} onClick={() => void saveStatus({ away: active })}>
          Set yourself as <strong>{active ? "away" : "active"}</strong>
        </button>

        <div className={styles.pauseWrap}>
          <button type="button" className={`${styles.item} ${styles.pauseRow}`} aria-expanded={pauseOpen} aria-controls="pause-menu" onClick={() => { setOpenedAt(Date.now()); setPauseOpen(!pauseOpen); }}>
            {paused ? <BellOff size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
            <span>
              {paused ? "Notifications paused" : "Pause notifications"}
              {paused && <small>Until {untilLabel(status!.pausedUntil!)}</small>}
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          {pauseOpen && <div id="pause-menu" role="menu" aria-label="Pause notifications" className={styles.submenu}>
            {paused && <>
              <p className={styles.submenuNote}>Notifications are paused until {untilLabel(status!.pausedUntil!)}.</p>
              <button type="button" role="menuitem" disabled={busy} onClick={() => void pause(null)}>Resume notifications</button>
              <div className={styles.divider} />
              <span className={styles.submenuLabel}>Adjust time</span>
            </>}
            {PAUSES.map(option => <button key={option.label} type="button" role="menuitem" disabled={busy} onClick={() => void pause(option.end(Date.now()))}>
              {option.label}{option.label.startsWith("Until") && <small>{untilLabel(option.end(openedAt).toISOString())}</small>}
            </button>)}
            <div className={styles.divider} />
            <form className={styles.customPause} onSubmit={event => { event.preventDefault(); if (custom) void pause(new Date(custom)); }}>
              <label htmlFor="pause-custom">Custom…</label>
              <input id="pause-custom" type="datetime-local" required value={custom} min={localInput(new Date(openedAt))} max={localInput(new Date(openedAt + 7 * 86_400_000))} onChange={event => setCustom(event.target.value)} />
              <button type="submit" className={styles.primary} disabled={busy || !custom}>Pause</button>
            </form>
            <div className={styles.divider} />
            <Link role="menuitem" href={`${settingsHref}?section=notifications`} onClick={() => setOpen(false)}>Notification settings</Link>
          </div>}
        </div>
      </>}

      <nav aria-label="Profile shortcuts" className={styles.links}>
        <Link href={`${settingsHref}?section=profile`} onClick={() => setOpen(false)}><UserRound size={15} aria-hidden="true" /> Profile</Link>
        <Link href={settingsHref} onClick={() => setOpen(false)}><Settings size={15} aria-hidden="true" /> Preferences</Link>
      </nav>
      <button type="button" className={styles.signOut} onClick={() => void signOut({ callbackUrl: "/login" })}><LogOut size={15} aria-hidden="true" /> Sign out</button>
    </div>, document.body)}
  </div>;
}

// The gear next to Sign out.
export function SettingsLink({ className, href = "/settings" }: { className?: string; href?: string }) {
  return <Link href={href} className={className} aria-label="Settings" title="Settings"><Settings size={17} aria-hidden="true" /></Link>;
}
