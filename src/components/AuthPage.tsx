"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button, Input } from "./Primitives";
import { ThemeBar } from "./SynkShell";
import { messageOf, request } from "@/features/chat/client";
import styles from "./Auth.module.css";

export default function AuthPage({ inviteToken, authError }: { inviteToken: string; authError: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(authError ? "Invalid email or password" : "");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const email = String(data.get("email")).trim().toLowerCase();
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result?.ok || result.error) { setError("Invalid email or password"); return; }
      if (inviteToken) {
        await request(`/api/invites/${encodeURIComponent(inviteToken)}/accept-existing`, { method: "POST", body: "{}" });
      }
      router.replace("/overview");
      router.refresh();
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  return <main className={styles.authPage}>
    <Link href="/" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
    <section className={styles.authCard}>
      <div className={styles.logo}>s</div><h1>Sign in to Synk</h1>
      <p className={styles.tagline}>We suggest using the email address you use at work.</p>
      <form onSubmit={submit} className={styles.form}>
        <label className={styles.field}><span>Email</span><div className={styles.inputWrap}><Mail size={17} /><Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} /></div></label>
        <label className={styles.field}><span>Password</span><div className={styles.inputWrap}><LockKeyhole size={17} /><Input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /><button className={styles.eye} onClick={() => setShowPassword(!showPassword)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button variant="primary" type="submit" disabled={busy} className={styles.submit}>{busy ? "Please wait…" : "Sign in"}</Button>
      </form>
      <p className={styles.switch}>New to Synk? <Link href="/create-workspace">Create a workspace</Link></p>
      {inviteToken && <p className={styles.secure}>Sign in with the invited email to join this workspace.</p>}
    </section><ThemeBar />
  </main>;
}
