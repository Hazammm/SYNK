"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import AuthAside from "@/components/AuthAside";
import Logo from "@/components/Logo";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read the token once, then strip it from the address bar so it doesn't
  // linger in browser history on shared computers.
  const [token] = useState(() => searchParams.get("token") ?? "");
  useEffect(() => {
    if (token) window.history.replaceState(null, "", "/reset-password");
  }, [token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Redirect to login a few seconds after success; cancelled if the user leaves first.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.replace("/login"), 3000);
    return () => clearTimeout(timer);
  }, [success, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");

    if (!token) {
      setError("Reset token is missing. Please use the link sent to your email.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError("Password must be at most 72 UTF-8 bytes.");
      return;
    }

    setBusy(true);

    try {
      await request<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.result}>
        <div className={styles.resultIcon} data-tone="high">
          <AlertCircle size={40} />
        </div>
        <p className={styles.resultTitle}>
          This reset link is missing a valid token or is incomplete.
        </p>
        <Link href="/forgot-password" className={styles.linkButton} data-variant="primary">Request a new reset link</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.result}>
        <div className={styles.resultIcon} data-tone="done">
          <CheckCircle2 size={40} />
        </div>
        <p className={styles.resultTitle}>
          Password successfully reset!
        </p>
        <p className={styles.resultNote}>
          All previous active sessions have been invalidated. Redirecting to login…
        </p>
        <Link href="/login" className={styles.linkButton} data-variant="primary">Proceed to Log In</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.field}>
        <span>New password</span>
        <div className={styles.inputWrap}>
          <LockKeyhole size={17} />
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 10 characters"
            required
            minLength={10}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className={styles.eye}
            onClick={() => setShowPassword(!showPassword)}
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>

      <label className={styles.field}>
        <span>Confirm new password</span>
        <div className={styles.inputWrap}>
          <LockKeyhole size={17} />
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            required
            minLength={10}
            maxLength={72}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </label>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <Button variant="primary" type="submit" disabled={busy} className={styles.submit}>
        {busy ? "Updating password…" : "Reset password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className={styles.authPage}>
      <Link href="/" className={styles.wordmark} aria-label="Synk home"><Logo size={22} /></Link>
      <section className={styles.authCard}>
        <h1>Create new password</h1>
        <p className={styles.tagline}>
          Choose a strong password with at least 10 characters.
        </p>
        <Suspense fallback={<p className={styles.resultNote}>Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className={styles.switch}>
          <Link href="/login">Back to log in</Link>
        </p>
      </section>
      <AuthAside />
    </main>
  );
}

