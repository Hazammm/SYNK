"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar, Button, Input } from "@/components/Primitives";
import Logo from "@/components/Logo";
import { initialsOf } from "@/components/ProfileMenu";
import { messageOf, request } from "@/lib/client-http";
import type { Account } from "@/lib/account-types";
import auth from "@/components/Auth.module.css";
import styles from "./ProfileSetup.module.css";

const TIME_ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } };

// Shown once after someone first signs in, like Slack's "set up your profile" step.
export default function ProfileSetup({ account, next }: { account: Account; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(account.name);
  const [image, setImage] = useState(account.profile.image);
  const [title, setTitle] = useState(account.profile.title);
  const [pronouns, setPronouns] = useState(account.profile.pronouns);
  const [timezone, setTimezone] = useState(account.profile.timezone || (TIME_ZONES.includes(browserZone()) ? browserZone() : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photo = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/me/avatar", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The photo could not be uploaded.");
      setImage(result.image);
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }

  async function finish(profile: object) {
    setBusy(true); setError("");
    try {
      await request("/api/me", { method: "PATCH", body: JSON.stringify({ ...profile, setupDone: true }) });
      router.replace(next);
      router.refresh();
    } catch (cause) { setError(messageOf(cause)); setBusy(false); }
  }

  return <main className={styles.page}>
    <span className={auth.wordmark}><Logo size={22} /></span>
    <section className={styles.card} aria-labelledby="setup-heading">
      <p className={styles.step}>Step {step} of 2</p>
      {step === 1 ? <>
        <h1 id="setup-heading">What&apos;s your name?</h1>
        <p className={auth.tagline}>Adding your name and a photo helps your teammates recognise and connect with you.</p>
        <form className={auth.form} onSubmit={event => { event.preventDefault(); if (name.trim()) setStep(2); }}>
          <label className={auth.field}><span>Full name</span>
            <Input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="e.g. Ayesha Khan" />
          </label>
          <div className={styles.photoRow}>
            <Avatar initials={initialsOf(name || "?")} src={image} />
            <div>
              <strong>Your profile photo</strong>
              <small>Optional. PNG, JPG, WebP or GIF.</small>
            </div>
            <input ref={photo} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
            <Button type="button" disabled={busy} onClick={() => photo.current?.click()}><Camera size={15} aria-hidden="true" /> {image ? "Change photo" : "Upload photo"}</Button>
          </div>
          {error && <p role="alert" className={auth.error}>{error}</p>}
          <Button variant="primary" className={auth.submit} disabled={busy || !name.trim()}>Next</Button>
        </form>
      </> : <>
        <h1 id="setup-heading">Tell your team about you</h1>
        <p className={auth.tagline}>Everyone in your workspace sees this on your profile, next to your messages and in the people directory.</p>
        <form className={auth.form} onSubmit={event => { event.preventDefault(); void finish({ name: name.trim(), title, pronouns, timezone }); }}>
          <label className={auth.field}><span>What you do</span>
            <Input autoFocus maxLength={80} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Frontend developer" autoComplete="organization-title" />
          </label>
          <label className={auth.field}><span>Pronouns</span>
            <Input maxLength={30} value={pronouns} onChange={event => setPronouns(event.target.value)} placeholder="e.g. she/her" />
          </label>
          <label className={auth.field}><span>Time zone</span>
            <select className={styles.select} value={timezone} onChange={event => setTimezone(event.target.value)}>
              <option value="">Not set</option>
              {TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
            </select>
            <small className={auth.fieldHint}>Teammates see your local time on your profile.</small>
          </label>
          {error && <p role="alert" className={auth.error}>{error}</p>}
          <Button variant="primary" className={auth.submit} disabled={busy}>{busy ? "Saving…" : "Finish"}</Button>
          <div className={styles.secondary}>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => setStep(1)}>Back</Button>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => void finish({ name: name.trim() })}>Skip for now</Button>
          </div>
        </form>
      </>}
    </section>
  </main>;
}
