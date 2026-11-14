"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/Primitives";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Synk.module.css";

type Member = {
  role: "ADMIN" | "MEMBER";
  user: { id: string; name: string | null; email: string | null };
};
type PendingInvite = { id: string; email: string; expiresAt: string; createdAt: string };

async function fetchWorkspaceMembers(workspaceId: string, role: "ADMIN" | "MEMBER") {
  const { members } = await request<{ members: Member[] }>(`/api/workspaces/${workspaceId}/members`);
  const invites = role === "ADMIN"
    ? (await request<{ invites: PendingInvite[] }>(`/api/workspaces/${workspaceId}/invites`)).invites
    : [];
  return { members, invites };
}

export default function WorkspaceMembers({
  workspaceId,
  role,
  userId,
  inviteDeliveryFailed = false,
}: {
  workspaceId: string;
  role: "ADMIN" | "MEMBER";
  userId: string;
  inviteDeliveryFailed?: boolean;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    try {
      const result = await fetchWorkspaceMembers(workspaceId, role);
      setMembers(result.members);
      setInvites(result.invites);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, role]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await fetchWorkspaceMembers(workspaceId, role);
        if (!active) return;
        setMembers(result.members);
        setInvites(result.invites);
      } catch (cause) {
        if (active) setError(messageOf(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [workspaceId, role]);

  async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("invite");
    setError("");
    setNotice("");
    try {
      const result = await request<{ emailDelivery: { failedEmails: string[] } }>(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        body: JSON.stringify({ emails: [email.trim().toLowerCase()] }),
      });
      setEmail("");
      setNotice(result.emailDelivery.failedEmails.length
        ? `Invitation created, but delivery failed for ${result.emailDelivery.failedEmails.join(", ")}.`
        : "Invitation sent.");
      await reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  }

  async function inviteAction(inviteId: string, action: "resend" | "revoke") {
    if (busy) return;
    setBusy(inviteId);
    setError("");
    setNotice("");
    try {
      const url = `/api/workspaces/${workspaceId}/invites/${inviteId}`;
      if (action === "resend") {
        const result = await request<{ sent: boolean; message?: string }>(url, { method: "POST", body: "{}" });
        setNotice(result.sent ? "Invitation resent." : result.message ?? "The invitation could not be sent.");
      } else {
        await request(url, { method: "DELETE" });
        setNotice("Invitation revoked.");
      }
      await reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  }

  async function removeMember(memberId: string) {
    if (busy) return;
    setBusy(memberId);
    setError("");
    setNotice("");
    try {
      await request(`/api/workspaces/${workspaceId}/members/${memberId}`, { method: "DELETE" });
      setNotice("Member removed.");
      await reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  }

  return <>
    <Card>
      <h2>Members</h2>
      <p className={styles.subtle}>{role === "ADMIN" ? "Invite people to collaborate in this workspace." : "People in this workspace."}</p>
      {role === "ADMIN" && <form className={styles.inviteForm} onSubmit={sendInvite}>
        <Input aria-label="Teammate email" type="email" placeholder="teammate@company.com" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
        <Button variant="primary" type="submit" disabled={!!busy}>{busy === "invite" ? "Sending…" : "Send invite"}</Button>
      </form>}
      {inviteDeliveryFailed && <p className={styles.memberNotice}>Some invite emails could not be delivered. Resend them below.</p>}
      {notice && <p className={styles.successNote} role="status">{notice}</p>}
      {error && <p className={styles.memberError} role="alert">{error}</p>}
      {loading ? <p className={styles.subtle}>Loading members…</p> : members.map(member => {
        const name = member.user.name || member.user.email || "Synk member";
        const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
        return <div className={styles.memberRow} key={member.user.id}>
          <span className={styles.memberAvatar} aria-hidden="true">{initials}</span>
          <span className={styles.memberDetails}><strong>{name}</strong><small>{member.user.email}</small></span>
          <Badge tone={member.role === "ADMIN" ? "action" : "neutral"}>{member.role === "ADMIN" ? "Admin" : "Member"}</Badge>
          {role === "ADMIN" && member.user.id !== userId && <Button className={styles.memberAction} disabled={!!busy} onClick={() => void removeMember(member.user.id)}>Remove</Button>}
        </div>;
      })}
    </Card>
    {role === "ADMIN" && <Card>
      <h2>Pending invites</h2>
      <p className={styles.subtle}>Invitations expire seven days after they are sent.</p>
      {!loading && invites.length === 0 && <p className={styles.subtle}>No pending invitations.</p>}
      {invites.map(invite => <div className={styles.invitePendingRow} key={invite.id}>
        <span><strong>{invite.email}</strong><small>Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></span>
        <div><Button disabled={!!busy} onClick={() => void inviteAction(invite.id, "resend")}>{busy === invite.id ? "Working…" : "Resend"}</Button><Button disabled={!!busy} onClick={() => void inviteAction(invite.id, "revoke")}>Revoke</Button></div>
      </div>)}
    </Card>}
  </>;
}
