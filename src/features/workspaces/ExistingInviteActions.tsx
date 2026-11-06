"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/Primitives";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

export function ExistingInviteJoin({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/invites/${encodeURIComponent(token)}/accept-existing`, { method: "POST", body: "{}" });
      router.replace("/overview");
      router.refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button variant="primary" type="button" className={styles.submit} disabled={busy} onClick={() => void join()}>{busy ? "Joining…" : "Join workspace"}</Button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </>;
}

export function SwitchAccountForInvite({ token }: { token: string }) {
  return <Button type="button" className={styles.submit} onClick={() => void signOut({ callbackUrl: `/login?invite=${encodeURIComponent(token)}` })}>
    Sign in with the invited email
  </Button>;
}

export function InviteSignInLink({ token }: { token: string }) {
  return <Link className={styles.inviteSignIn} href={`/login?invite=${encodeURIComponent(token)}`}>Sign in to join</Link>;
}
