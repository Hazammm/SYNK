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

/** Inline SVG for the Google "G" logo — no extra dependency. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

export default function AuthPage({
  inviteToken,
  authError,
  googleEnabled,
}: {
  inviteToken: string;
  authError: boolean;
  googleEnabled?: boolean;
}) {
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

  async function googleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await signIn("google", { callbackUrl: "/overview" });
    } catch {
      setBusy(false);
    }
  }

  return <main className={styles.authPage}>
    <Link href="/" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
    <section className={styles.authCard}>
      <div className={styles.logo}>s</div><h1>Sign in to Synk</h1>
      <p className={styles.tagline}>We suggest using the email address you use at work.</p>
      <form onSubmit={submit} className={styles.form}>
        <label className={styles.field}><span>Email</span><div className={styles.inputWrap}><Mail size={17} /><Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} /></div></label>
        <label className={styles.field}><span>Password</span><div className={styles.inputWrap}><LockKeyhole size={17} /><Input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /><button className={styles.eye} onClick={() => setShowPassword(!showPassword)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <div className={styles.formOptions}><span /><Link href="/forgot-password">Forgot password?</Link></div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button variant="primary" type="submit" disabled={busy} className={styles.submit}>{busy ? "Please wait…" : "Sign in"}</Button>
      </form>
      {googleEnabled && <>
        <div className={styles.divider}>or</div>
        <button className={styles.googleButton} type="button" onClick={googleSignIn} disabled={busy}>
          <GoogleIcon />
          Continue with Google
        </button>
      </>}
      <p className={styles.switch}>New to Synk? <Link href="/create-workspace">Create a workspace</Link></p>
      {inviteToken && <p className={styles.secure}>Sign in with the invited email to join this workspace.</p>}
    </section><ThemeBar />
  </main>;
}
