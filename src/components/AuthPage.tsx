"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button, Input } from "./Primitives";
import { ThemeBar } from "./SynkShell";
import styles from "./Auth.module.css";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const strength = Math.min(4, Number(password.length >= 8) + Number(/[A-Z]/.test(password)) + Number(/[0-9]/.test(password)) + Number(/[^A-Za-z0-9]/.test(password)));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/overview");
  }

  return (
    <main className={styles.authPage}>
      <Link href="/overview" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
      <section className={styles.authCard}>
        <div className={styles.logo}>s</div>
        <h1>{signup ? "Create your account" : "Synk"}</h1>
        <p className={styles.tagline}>{signup ? "Start building better things together." : "Chat, tickets, docs and time. One workspace."}</p>
        <form onSubmit={submit} className={styles.form}>
          {signup && <label className={styles.field}><span>Full name</span><div className={styles.inputWrap}><UserRound size={17} /><Input autoComplete="name" placeholder="Your name" required /></div></label>}
          <label className={styles.field}><span>Workspace email</span><div className={styles.inputWrap}><Mail size={17} /><Input type="email" autoComplete="email" placeholder="you@workspace.com" required /></div></label>
          <label className={styles.field}><span>Password</span><div className={styles.inputWrap}><LockKeyhole size={17} /><Input type={showPassword ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} placeholder="Enter your password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /><button className={styles.eye} onClick={() => setShowPassword(!showPassword)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {signup ? <div className={styles.strength}><div className={styles.meter}>{[1, 2, 3, 4].map((segment) => <i key={segment} className={strength >= segment ? styles.filled : ""} />)}</div><span>{strength < 2 ? "Use 8+ characters for a stronger password." : strength < 4 ? "Good start — add a number and symbol." : "Strong password"}</span></div> : <div className={styles.formOptions}><label className={styles.check}><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label><Link href="/login">Forgot password?</Link></div>}
          {signup && <label className={styles.check}><input required type="checkbox" /> I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a></label>}
          <Button variant="primary" type="submit" className={styles.submit}>{signup ? "Create account" : "Login"} <span aria-hidden="true">→</span></Button>
        </form>
        {!signup && <><div className={styles.divider}><span>or</span></div><Button type="button" className={styles.university}><Mail size={17} /> Continue with workspace email</Button></>}
        <p className={styles.switch}>{signup ? "Already have an account?" : "Don’t have an account?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link></p>
        <div className={styles.secure}><LockKeyhole size={13} /> Your workspace, secured</div>
      </section>
      <p className={styles.authFoot}>© 2025 Synk workspace</p>
      <ThemeBar />
    </main>
  );
}
