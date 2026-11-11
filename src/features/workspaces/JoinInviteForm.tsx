"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

export default function JoinInviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await request<{ workspace: { id: string }; welcomeEmailFailed: boolean }>(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify({ name, password }),
      });
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result?.ok || result.error) {
        router.replace("/login");
        router.refresh();
        return;
      }
      router.replace(res.welcomeEmailFailed
        ? `/w/${res.workspace.id}/settings?welcomeEmail=failed`
        : `/w/${res.workspace.id}/overview`);
      router.refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <label className={styles.field}><span>Email</span><div className={styles.inputWrap}><Mail size={17} /><Input type="email" value={email} readOnly aria-readonly="true" /></div></label>
    <label className={styles.field}><span>Full name</span><div className={styles.inputWrap}><UserRound size={17} /><Input autoComplete="name" placeholder="Your name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></div></label>
    <label className={styles.field}><span>Password</span><div className={styles.inputWrap}><LockKeyhole size={17} /><Input type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" required minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /><button className={styles.eye} onClick={() => setShowPassword(value => !value)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <Button variant="primary" type="submit" disabled={busy} className={styles.submit}>{busy ? "Joining…" : "Join workspace"}</Button>
  </form>;
}
