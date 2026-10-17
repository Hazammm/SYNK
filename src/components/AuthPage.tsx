"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button, Input } from "./Primitives";
import { ThemeBar } from "./SynkShell";
import { messageOf, request } from "@/features/chat/client";
import styles from "./Auth.module.css";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let active = true;
    void getProviders().then(result => { if (active) setProviders(Object.values(result ?? {}).filter(provider => provider.type === "oauth")); });
    const authError = new URLSearchParams(window.location.search).get("error");
    if (authError) Promise.resolve().then(() => { if (active) setError("Sign-in failed. Try again, or use the sign-in method you originally registered with."); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const email = String(data.get("email")).trim().toLowerCase();
      if (signup) await request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: data.get("name"), email, password }) });
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result?.ok || result.error) { setError(signup ? "Account created. Please try logging in." : "Unable to sign in. Check your email and password, or wait a few minutes if you have tried repeatedly."); return; }
      router.replace("/chat"); router.refresh();
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  return <main className={styles.authPage}>
    <Link href="/" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
    <section className={styles.authCard}>
      <div className={styles.logo}>s</div><h1>{signup ? "Create your account" : "Welcome to Synk"}</h1>
      <p className={styles.tagline}>{signup ? "Start building better things together." : "Your team’s conversations, in one place."}</p>
      <form onSubmit={submit} className={styles.form}>
        {signup && <label className={styles.field}><span>Full name</span><div className={styles.inputWrap}><UserRound size={17} /><Input name="name" autoComplete="name" placeholder="Your name" required maxLength={80} /></div></label>}
        <label className={styles.field}><span>Workspace email</span><div className={styles.inputWrap}><Mail size={17} /><Input name="email" type="email" autoComplete="email" placeholder="you@workspace.com" required maxLength={254} /></div></label>
        <label className={styles.field}><span>Password</span><div className={styles.inputWrap}><LockKeyhole size={17} /><Input type={showPassword ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 10 characters" : "Enter your password"} required minLength={signup ? 10 : 1} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /><button className={styles.eye} onClick={() => setShowPassword(!showPassword)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button variant="primary" type="submit" disabled={busy} className={styles.submit}>{busy ? "Please wait…" : signup ? "Create account" : "Log in"}</Button>
      </form>
      {providers.length > 0 && <><div className={styles.divider}><span>or</span></div>{providers.map(provider => <Button key={provider.id} type="button" className={styles.university} disabled={busy} onClick={() => void signIn(provider.id, { callbackUrl: "/chat" })}>Continue with {provider.name}</Button>)}</>}
      <p className={styles.switch}>{signup ? "Already have an account?" : "Don’t have an account?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link></p>
      <div className={styles.secure}><LockKeyhole size={13} /> Your workspace, secured</div>
    </section><ThemeBar />
  </main>;
}
