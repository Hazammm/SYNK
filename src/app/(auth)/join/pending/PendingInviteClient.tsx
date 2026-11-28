"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/Primitives";
import AuthAside from "@/components/AuthAside";
import Logo from "@/components/Logo";
import { messageOf } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

interface Invite {
  id: string;
  expiresAt: string;
  workspace: { id: string; name: string };
}

interface Props {
  email: string;
  name: string;
  invites: Invite[];
}

export default function PendingInviteClient({ email, name, invites }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // invite id being accepted
  const [error, setError] = useState("");

  async function acceptInvite(inviteId: string, workspaceId: string) {
    if (busy) return;
    setBusy(inviteId);
    setError("");
    try {
      const res = await fetch("/api/invites/accept-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not accept the invitation.");
      }
      const data = await res.json() as { welcomeEmailFailed?: boolean };
      const callbackUrl = data.welcomeEmailFailed
        ? `/w/${workspaceId}/settings?welcomeEmail=failed`
        : `/w/${workspaceId}/overview`;
      router.replace(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(messageOf(err));
      setBusy(null);
    }
  }

  return (
    <main className={styles.authPage}>
      <Link href="/" className={styles.wordmark} aria-label="Synk home"><Logo size={22} /></Link>
      <section className={styles.authCard}>
        <h1>You&apos;re invited!</h1>
        <p className={styles.tagline}>
          <strong>{name || email}</strong> — you have {invites.length === 1 ? "an invitation" : "invitations"} waiting.
          Accept one to join as a member.
        </p>
        <ul className={styles.inviteList}>
          {invites.map(invite => (
            <li key={invite.id}>
              <span><Building2 size={16} aria-hidden="true" />{invite.workspace.name}</span>
              <Button variant="primary" disabled={!!busy} onClick={() => void acceptInvite(invite.id, invite.workspace.id)}>
                {busy === invite.id ? "Joining…" : "Join"}
              </Button>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={styles.switch}>
          Want a fresh start? <Link href="/create-workspace?from=google">Create a workspace</Link>
        </p>
      </section>
      <AuthAside />
    </main>
  );
}
