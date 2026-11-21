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
      <label>Phone<Input type="tel" maxLength={30} value={form.phone} onChange={set("phone")} placeholder="+92 300 1234567" autoComplete="tel" pattern="[+0-9 \(\)\-]*" title="Digits, spaces, +, - and brackets only" /></label>
      <label>Location<Input maxLength={80} value={form.location} onChange={set("location")} placeholder="e.g. Lahore, Pakistan" autoComplete="address-level2" /></label>
      <label>Time zone<select value={form.timezone} onChange={set("timezone")} aria-describedby="timezone-hint">
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

// Snooze (pause pop-ups for a while) and focus mode (pause and set a "Focusing" status together).
export function PauseSettings({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [until, setUntil] = useState(account.notificationsPausedUntil);
  const [focusMinutes, setFocusMinutes] = useState(60);
  const { busy, run, feedback } = useSaving();
  const pause = (date: Date | null) => run(async () => {
    const result = await request<{ pausedUntil: string | null }>("/api/me/pause", { method: "PUT", body: JSON.stringify({ until: date?.toISOString() ?? null }) });
    setUntil(result.pausedUntil); onSaved();
    return result.pausedUntil ? `Notifications paused until ${new Date(result.pausedUntil).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : "Notifications resumed.";
  });
  const focus = () => void run(async () => {
    const end = pauseEnd(focusMinutes);
    await request("/api/me/pause", { method: "PUT", body: JSON.stringify({ until: end.toISOString() }) });
    await request("/api/me/status", { method: "PUT", body: JSON.stringify({ text: "Focusing", emoji: "🎯", expiresAt: end.toISOString() }) });
    setUntil(end.toISOString()); onSaved();
    return `Focus mode is on until ${end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}. Notifications are paused and your status says you're focusing.`;
  });
  return <Section title="Pause notifications" description="While paused, alerts still collect under Alerts, but no pop-ups or sounds interrupt you.">
    <p className={styles.sessions}>{until ? <>Paused until <strong>{new Date(until).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</strong>.</> : "Notifications are on."}</p>
    <div className={styles.presets} role="group" aria-label="Pause notifications for">
      {PAUSES.map(option => <button key={option.label} type="button" disabled={busy} onClick={() => void pause(pauseEnd(option.minutes))}>{option.label}</button>)}
      {until && <button type="button" disabled={busy} onClick={() => void pause(null)}>Resume now</button>}
    </div>
    <h3 className={styles.subheading}>Focus mode</h3>
    <p className={styles.hint}>Pauses notifications and sets your status to “🎯 Focusing” for the time you choose.</p>
    <div className={styles.actions}>
      <select aria-label="Focus for" value={focusMinutes} onChange={event => setFocusMinutes(Number(event.target.value))}>
        {[25, 60, 120, 240].map(minutes => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} minutes` : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`}</option>)}
      </select>
      <Button variant="primary" disabled={busy} onClick={focus}>Start focus mode</Button>
    </div>
    {feedback}
  </Section>;
}

// Pop-ups from the browser when a new alert arrives and Synk is in the background. Kept per browser.
export function DesktopNotifications() {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState(supported ? Notification.permission : "denied");
  const [enabled, setEnabled] = useState(supported && window.localStorage.getItem(DESKTOP_KEY) === "on");
  const turnOn = async () => {
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") { window.localStorage.setItem(DESKTOP_KEY, "on"); setEnabled(true); new Notification("Synk notifications are on", { body: "You'll see new mentions and messages here." }); }
  };
  const turnOff = () => { window.localStorage.removeItem(DESKTOP_KEY); setEnabled(false); };
  return <Section title="Desktop notifications" description="Show a pop-up from your browser for new mentions, direct messages, replies and ticket alerts while Synk is open in the background.">
    {!supported ? <p className={styles.notice}>This browser does not support notifications.</p>
      : permission === "denied" ? <p className={styles.notice}>Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come back here.</p>
      : <div className={styles.actions}>
          {enabled ? <Button onClick={turnOff}>Turn off desktop notifications</Button> : <Button variant="primary" onClick={() => void turnOn()}>Turn on desktop notifications</Button>}
          <span className={styles.hint}>{enabled ? "On in this browser." : "Off in this browser."}</span>
        </div>}
  </Section>;
}

// Two-factor sign-in with an authenticator app, plus one-time recovery codes.
export function TwoFactor({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const { busy, run, feedback } = useSaving();
  const title = "Two-factor sign-in";
  const description = "After your password, Synk also asks for a code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.";
  if (!account.hasPassword) return <Section title={title} description={description}><p className={styles.notice}>You sign in with {account.providers.join(" or ") || "another provider"}. Turn on two-step verification in that account instead.</p></Section>;

  const start = () => void run(async () => { setSetup(await request<{ secret: string; otpauthUrl: string }>("/api/me/two-factor/setup", { method: "POST", body: "{}" })); return ""; });
  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await request<{ recoveryCodes: string[] }>("/api/me/two-factor", { method: "POST", body: JSON.stringify({ code }) });
      setRecoveryCodes(result.recoveryCodes); setSetup(null); setCode(""); onChanged();
      return "Two-factor sign-in is on.";
    });
  };
  const disable = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await request("/api/me/two-factor", { method: "DELETE", body: JSON.stringify({ password, code }) });
      setPassword(""); setCode(""); setRecoveryCodes([]); onChanged();
      return "Two-factor sign-in is off.";
    });
  };

  return <Section title={title} description={description}>
    {recoveryCodes.length > 0 && <div className={styles.recovery}>
      <p><strong>Save these recovery codes now.</strong> Each one signs you in once if you lose your phone. They won&apos;t be shown again.</p>
      <ul>{recoveryCodes.map(item => <li key={item}><code>{item}</code></li>)}</ul>
      <Button onClick={() => void navigator.clipboard.writeText(recoveryCodes.join("\n"))}>Copy codes</Button>
    </div>}
    {account.twoFactorEnabled ? <form className={styles.form} onSubmit={disable}>
      <p className={styles.notice}>On. You&apos;ll be asked for a code each time you sign in with your password.</p>
      <label>Password<Input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>Code from your app, or a recovery code<Input required inputMode="numeric" autoComplete="one-time-code" maxLength={20} value={code} onChange={event => setCode(event.target.value)} /></label>
      <div className={styles.actions}><Button disabled={busy}>Turn off two-factor sign-in</Button>{feedback}</div>
    </form> : setup ? <form className={styles.form} onSubmit={confirm}>
      <ol className={styles.steps}>
        <li>In your authenticator app, add an account and enter this key: <code className={styles.secret}>{setup.secret.match(/.{1,4}/g)?.join(" ")}</code> On this phone? <a href={setup.otpauthUrl}>Open it in your app</a>.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <label>Code<Input required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} /></label>
      <div className={styles.actions}><Button variant="primary" disabled={busy}>Turn on</Button><Button type="button" variant="quiet" onClick={() => setSetup(null)}>Cancel</Button>{feedback}</div>
    </form> : <div className={styles.actions}><Button variant="primary" disabled={busy} onClick={start}>Set up two-factor sign-in</Button>{feedback}</div>}
  </Section>;
}
