"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff, LockKeyhole, CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { ThemeBar } from "@/components/SynkShell";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

    setBusy(true);

    try {
      await request<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
      setTimeout(() => {
        router.replace("/login");
      }, 3000);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: "center", display: "grid", gap: "16px", padding: "12px 0" }}>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--high)" }}>
          <AlertCircle size={40} />
        </div>
        <p style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>
          This reset link is missing a valid token or is incomplete.
        </p>
        <Link href="/forgot-password" style={{ marginTop: "8px" }}>
          <Button variant="primary" style={{ width: "100%" }}>
            Request a new reset link
          </Button>
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ textAlign: "center", display: "grid", gap: "16px", padding: "12px 0" }}>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--action)" }}>
          <CheckCircle2 size={40} />
        </div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", margin: 0 }}>
          Password successfully reset!
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
          All previous active sessions have been invalidated. Redirecting to login…
        </p>
        <Link href="/login" style={{ marginTop: "8px" }}>
          <Button variant="primary" style={{ width: "100%" }}>
            Proceed to Log In
          </Button>
        </Link>
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
      <Link href="/" className={styles.wordmark}>
        <span className={styles.brandMark}>s</span> synk
      </Link>
      <section className={styles.authCard}>
        <div className={styles.logo}>s</div>
        <h1>Create new password</h1>
        <p className={styles.tagline}>
          Choose a strong password with at least 10 characters.
        </p>
        <Suspense fallback={<p style={{ textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className={styles.switch}>
          <Link href="/login">Back to log in</Link>
        </p>
      </section>
      <ThemeBar />
    </main>
  );
}

