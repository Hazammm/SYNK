"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { messageOf, request } from "@/lib/client-http";
import { Section, useSaving } from "@/features/account/PersonalSettings";
import styles from "@/features/account/Settings.module.css";

type Settings = { id: string; name: string; invitePolicy: "ADMINS" | "EVERYONE" };
type Analytics = {
  members: number; newMembers: number; channels: number;
  messages: { week: number; month: number }; activeMembers: { week: number; month: number };
  tickets: { created: number; completed: number }; daily: { date: string; messages: number }[];
};

// Workspace admin: rename, who can invite, usage and a data export.
export default function WorkspaceAdmin({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const rename = useSaving(), policy = useSaving();

  useEffect(() => {
    request<{ workspace: Settings }>(`/api/workspaces/${workspaceId}`).then(result => { setSettings(result.workspace); setName(result.workspace.name); }).catch(cause => setError(messageOf(cause)));
    request<{ analytics: Analytics }>(`/api/workspaces/${workspaceId}/analytics`).then(result => setAnalytics(result.analytics)).catch(cause => setError(messageOf(cause)));
  }, [workspaceId]);

  const save = (body: Partial<Settings>, done: string, saving: typeof rename) => void saving.run(async () => {
    const result = await request<{ workspace: Settings }>(`/api/workspaces/${workspaceId}`, { method: "PATCH", body: JSON.stringify(body) });
    setSettings(result.workspace); router.refresh();
    return done;
  });

  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!settings) return <p role="status" className={styles.muted}>Loading workspace settings…</p>;
  const peak = Math.max(1, ...(analytics?.daily.map(day => day.messages) ?? [0]));

  return <>
    <Section title="Workspace name" description="Shown in the sidebar, in invitations and to everyone in the workspace.">
      <form className={styles.form} onSubmit={event => { event.preventDefault(); save({ name }, "Workspace renamed.", rename); }}>
        <label>Name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <div className={styles.actions}><Button variant="primary" disabled={rename.busy || !name.trim() || name.trim() === settings.name}>Rename</Button>{rename.feedback}</div>
      </form>
    </Section>
    <Section title="Who can invite people" description="Admins can always invite. You can let every member invite teammates too.">
      <label className={styles.switchRow}>
        <span><strong>Every member can invite</strong><small>Members see the invite box under Settings, Members.</small></span>
        <input type="checkbox" role="switch" checked={settings.invitePolicy === "EVERYONE"} disabled={policy.busy}
          onChange={event => save({ invitePolicy: event.target.checked ? "EVERYONE" : "ADMINS" }, event.target.checked ? "Every member can invite now." : "Only admins can invite now.", policy)} />
      </label>
      {policy.feedback}
    </Section>
    <Section title="Usage" description="Activity in this workspace. Deleted messages are not counted.">
      {!analytics ? <p role="status" className={styles.muted}>Loading usage…</p> : <>
        <dl className={styles.stats}>
          <div><dt>Members</dt><dd>{analytics.members}</dd><small>{analytics.newMembers} joined in 30 days</small></div>
          <div><dt>Active this week</dt><dd>{analytics.activeMembers.week}</dd><small>{analytics.activeMembers.month} in 30 days</small></div>
          <div><dt>Messages this week</dt><dd>{analytics.messages.week}</dd><small>{analytics.messages.month} in 30 days</small></div>
          <div><dt>Tickets in 30 days</dt><dd>{analytics.tickets.created}</dd><small>{analytics.tickets.completed} completed</small></div>
          <div><dt>Open channels</dt><dd>{analytics.channels}</dd></div>
        </dl>
        <figure className={styles.daily} aria-label="Messages per day for the last 14 days">
          <div>{analytics.daily.map(day => <span key={day.date} title={`${day.date}: ${day.messages} messages`} style={{ height: `${Math.round((day.messages / peak) * 100)}%` }} />)}</div>
          <figcaption>Messages per day, last 14 days</figcaption>
        </figure>
      </>}
    </Section>
    <Section title="Export data" description="Download members, public channels with their messages, and projects with their tickets as a JSON file. Private channels and direct messages are not included.">
      <a className={styles.download} href={`/api/workspaces/${workspaceId}/export`} download><Download size={15} aria-hidden="true" /> Download export</a>
    </Section>
  </>;
}
