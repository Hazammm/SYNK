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
