"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import AuthAside from "@/components/AuthAside";
import Logo from "@/components/Logo";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      const email = String(data.get("email") ?? "");
      await request<{ message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <Link href="/" className={styles.wordmark} aria-label="Synk home"><Logo size={22} /></Link>
      <section className={styles.authCard}>
        <h1>Reset your password</h1>
        <p className={styles.tagline}>
          {submitted
            ? "Recovery instructions have been dispatched."
            : "Enter your workspace email and we’ll send you a reset link."}
        </p>

        {submitted ? (
          <div className={styles.result}>
            <div className={styles.resultIcon} data-tone="done">
              <CheckCircle2 size={40} />
            </div>
            <p className={styles.resultTitle}>
              If an account is associated with that email, we have sent password reset instructions.
            </p>
            <p className={styles.resultNote}>
              Be sure to check your spam or junk folder if you don&apos;t see it within a few minutes.
            </p>
            <Link href="/login" className={styles.linkButton} data-variant="secondary">Return to log in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <label className={styles.field}>
              <span>Workspace email</span>
              <div className={styles.inputWrap}>
                <Mail size={17} />
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@workspace.com"
                  required
                  maxLength={254}
                />
              </div>
            </label>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <Button variant="primary" type="submit" disabled={busy} className={styles.submit}>
              {busy ? "Sending link…" : "Send reset link"}
            </Button>
          </form>
        )}

        <p className={styles.switch}>
          <Link href="/login" className={styles.backLink}>
            <ArrowLeft size={13} /> Back to log in
          </Link>
        </p>
      </section>
      <AuthAside />
    </main>
  );
}

