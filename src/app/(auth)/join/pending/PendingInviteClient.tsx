"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/Primitives";
import { ThemeBar } from "@/components/SynkShell";
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
      // Trigger a Google sign-in which will now find the user and link the account.
      const callbackUrl = data.welcomeEmailFailed
        ? `/w/${workspaceId}/settings?welcomeEmail=failed`
        : `/w/${workspaceId}/overview`;
      await signIn("google", { callbackUrl, redirect: true });
    } catch (err) {
      setError(messageOf(err));
      setBusy(null);
    }
  }

  return (
    <main className={styles.authPage}>
      <Link href="/" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
      <section className={styles.authCard}>
        <div className={styles.logo}>s</div>
        <h1>You&apos;re invited!</h1>
        <p className={styles.tagline}>
          <strong>{name || email}</strong> — you have {invites.length === 1 ? "an invitation" : "invitations"} waiting.
          Accept one to join as a member.
        </p>
        <div style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
          {invites.map(invite => (
            <div key={invite.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "12px", padding: "12px 14px", border: "1px solid var(--structure)",
              borderRadius: "8px", background: "var(--bg)",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
                <Building2 size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
                {invite.workspace.name}
              </span>
              <Button
                variant="primary"
                disabled={!!busy}
                onClick={() => void acceptInvite(invite.id, invite.workspace.id)}
                style={{ minWidth: "80px", fontSize: "11px" }}
              >
                {busy === invite.id ? "Joining…" : "Join"}
              </Button>
            </div>
          ))}
        </div>
        {error && <p role="alert" className={styles.error} style={{ marginTop: "12px" }}>{error}</p>}
        <p className={styles.switch} style={{ marginTop: "20px" }}>
          Want a fresh start? <Link href="/create-workspace?from=google">Create a workspace</Link>
        </p>
      </section>
      <ThemeBar />
    </main>
  );
}
