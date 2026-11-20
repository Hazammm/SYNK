"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar, Button, Input } from "@/components/Primitives";
import { initialsOf } from "@/components/ProfileMenu";
import { messageOf, request } from "@/lib/client-http";
import type { Account, PersonStatus } from "@/lib/account-types";
import { DESKTOP_KEY } from "@/features/notifications/live";
import styles from "./Settings.module.css";

type Saving = { busy: boolean; run: (action: () => Promise<string>) => Promise<void>; feedback: React.ReactNode };
export function useSaving(): Saving {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function run(action: () => Promise<string>) {
    setBusy(true); setNotice(""); setError("");
    try { setNotice(await action()); } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  return { busy, run, feedback: <>{error && <p role="alert" className={styles.error}>{error}</p>}<p role="status" className={styles.notice}>{notice}</p></> };
}

export function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const id = `${title}-heading`.replace(/\s+/g, "-");
  return <section className={styles.card} aria-labelledby={id}><h2 id={id}>{title}</h2><p className={styles.muted}>{description}</p>{children}</section>;
}

const TIME_ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

export function ProfileDetails({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: account.name, ...account.profile });
  const photo = useRef<HTMLInputElement>(null);
  const details = useSaving(), picture = useSaving();
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [field]: event.target.value });
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void details.run(async () => {
      const { name, title, phone, location, timezone, pronouns } = form;
      await request("/api/me", { method: "PATCH", body: JSON.stringify({ name, title, phone, location, timezone, pronouns }) });
      onSaved(); router.refresh(); // the header shows the new name
      return "Your profile was saved.";
    });
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    void picture.run(async () => {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/me/avatar", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The photo could not be uploaded.");
      setForm(current => ({ ...current, image: result.image })); onSaved(); router.refresh();
      return "Your photo was updated.";
    });
  };
  const removePhoto = () => void picture.run(async () => {
    const result = await request<{ image: string | null }>("/api/me/avatar", { method: "DELETE" });
    setForm(current => ({ ...current, image: result.image })); onSaved(); router.refresh();
    return "Your photo was removed.";
  });

  return <Section title="Profile" description="How you appear to teammates in chat, on tickets, in mentions and in the people directory.">
    <div className={styles.identity}>
      <Avatar initials={initialsOf(form.name || account.name)} src={form.image} />
      <div><strong>{form.name || account.name}</strong><span>{account.email}</span></div>
      <div className={styles.actions}>
        <input ref={photo} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} />
        <Button type="button" disabled={picture.busy} onClick={() => photo.current?.click()}>{picture.busy ? "Uploading…" : "Upload photo"}</Button>
        {account.profile.image?.startsWith("/api/") && <Button type="button" variant="quiet" disabled={picture.busy} onClick={removePhoto}>Remove photo</Button>}
      </div>
    </div>
    {picture.feedback}
    <form className={styles.form} onSubmit={save}>
      <label>Display name<Input required maxLength={80} value={form.name} onChange={set("name")} autoComplete="name" /></label>
      <label>Title or role<Input maxLength={80} value={form.title} onChange={set("title")} placeholder="e.g. Frontend developer" autoComplete="organization-title" /></label>
      <label>Pronouns<Input maxLength={30} value={form.pronouns} onChange={set("pronouns")} placeholder="e.g. she/her" /></label>
      <label>Phone<Input type="tel" maxLength={30} value={form.phone} onChange={set("phone")} placeholder="+92 300 1234567" autoComplete="tel" /></label>
      <label>Location<Input maxLength={80} value={form.location} onChange={set("location")} placeholder="e.g. Lahore, Pakistan" /></label>
      <label>Time zone<select value={form.timezone} onChange={set("timezone")}>
        <option value="">Not set</option>{TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
      </select></label>
      <p className={styles.hint}>Teammates see your local time next to your name.</p>
      <label>Email<Input value={account.email ?? ""} disabled readOnly /></label>
      <div className={styles.actions}><Button variant="primary" disabled={details.busy || !form.name.trim()}>{details.busy ? "Saving…" : "Save profile"}</Button>{details.feedback}</div>
    </form>
  </Section>;
}

// Presets like Slack's. Each sets the text, an emoji and when it clears.
const PRESETS: { text: string; emoji: string; clears: string }[] = [
  { text: "In a meeting", emoji: "📅", clears: "1h" },
  { text: "Commuting", emoji: "🚌", clears: "30m" },
  { text: "Working from home", emoji: "🏠", clears: "today" },
  { text: "On vacation", emoji: "🌴", clears: "week" },
  { text: "Out sick", emoji: "🤒", clears: "today" },
  { text: "Not available", emoji: "⛔", clears: "4h" },
];
const CLEAR_OPTIONS = [
  { id: "never", label: "Don't clear" }, { id: "30m", label: "In 30 minutes" }, { id: "1h", label: "In 1 hour" },
  { id: "4h", label: "In 4 hours" }, { id: "today", label: "At the end of today" }, { id: "week", label: "In a week" },
];
export function clearTime(option: string, now = new Date()): string | null {
  const minutes = { "30m": 30, "1h": 60, "4h": 240, week: 7 * 24 * 60 }[option as "30m"];
  if (minutes) return new Date(now.getTime() + minutes * 60_000).toISOString();
  if (option === "today") { const end = new Date(now); end.setHours(23, 59, 0, 0); return end.toISOString(); }
  return null;
}

export function StatusSettings({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [status, setStatus] = useState<PersonStatus>(account.status);
  const [draft, setDraft] = useState({ text: account.status.text, emoji: account.status.emoji, clears: account.status.expiresAt ? "keep" : "never" });
  const { busy, run, feedback } = useSaving();
  const save = (body: object, message: string) => void run(async () => {
    const result = await request<{ status: PersonStatus }>("/api/me/status", { method: "PUT", body: JSON.stringify(body) });
    setStatus(result.status); onSaved();
    return message;
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const expiresAt = draft.clears === "keep" ? status.expiresAt : clearTime(draft.clears);
    save({ text: draft.text, emoji: draft.emoji, expiresAt, away: status.away }, draft.text || draft.emoji ? "Your status was set." : "Your status was cleared.");
  };
  return <Section title="Status" description="Let teammates know what you're up to. It shows next to your name in chat and in the people directory.">
    <p className={styles.sessions}>
      {status.emoji || status.text ? <><span aria-hidden="true">{status.emoji}</span> <strong>{status.text}</strong>{status.expiresAt && <small> · clears {new Date(status.expiresAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</small>}</> : "No status set."}
    </p>
    <div className={styles.presets} role="group" aria-label="Status presets">
      {PRESETS.map(preset => <button key={preset.text} type="button" disabled={busy} onClick={() => setDraft({ text: preset.text, emoji: preset.emoji, clears: preset.clears })}>
        <span aria-hidden="true">{preset.emoji}</span> {preset.text}
      </button>)}
    </div>
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.row}>
        <label className={styles.emoji}>Emoji<Input maxLength={16} value={draft.emoji} onChange={event => setDraft({ ...draft, emoji: event.target.value })} placeholder="🙂" /></label>
        <label>Status<Input maxLength={100} value={draft.text} onChange={event => setDraft({ ...draft, text: event.target.value })} placeholder="What's your status?" /></label>
      </div>
      <label>Clear after<select value={draft.clears} onChange={event => setDraft({ ...draft, clears: event.target.value })}>
        {draft.clears === "keep" && <option value="keep">Keep the current time</option>}
        {CLEAR_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select></label>
      <div className={styles.actions}>
        <Button variant="primary" disabled={busy}>Save status</Button>
        <Button type="button" variant="quiet" disabled={busy || !(status.text || status.emoji)} onClick={() => { setDraft({ text: "", emoji: "", clears: "never" }); save({ text: "", emoji: "", expiresAt: null }, "Your status was cleared."); }}>Clear status</Button>
      </div>
    </form>
    <ul className={styles.toggles}><li>
      <label><span><strong>Set yourself as away</strong><small>Teammates see you as away even while Synk is open.</small></span>
        <input type="checkbox" role="switch" checked={status.away} disabled={busy} onChange={event => save({ text: status.text, emoji: status.emoji, expiresAt: status.expiresAt, away: event.target.checked }, event.target.checked ? "You now show as away." : "You now show as active.")} /></label>
    </li></ul>
    {feedback}
  </Section>;
}

const PAUSES = [{ minutes: 30, label: "30 minutes" }, { minutes: 60, label: "1 hour" }, { minutes: 120, label: "2 hours" }, { minutes: 0, label: "Until tomorrow 9:00" }];
const pauseEnd = (minutes: number, now = new Date()) => {
  if (minutes) return new Date(now.getTime() + minutes * 60_000);
  const morning = new Date(now); morning.setDate(morning.getDate() + 1); morning.setHours(9, 0, 0, 0);
  return morning;
};
