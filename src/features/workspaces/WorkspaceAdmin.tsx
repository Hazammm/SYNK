"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button, Input, SkeletonList } from "@/components/Primitives";
import { messageOf, request } from "@/lib/client-http";
import { Section, useSaving } from "@/features/account/PersonalSettings";
import styles from "@/features/account/Settings.module.css";

type Settings = { id: string; name: string; invitePolicy: "ADMINS" | "EVERYONE"; allowedEmailDomains: string[]; requireGoogleSignIn: boolean };
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
  const [domains, setDomains] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const rename = useSaving(), policy = useSaving(), join = useSaving();

  useEffect(() => {
    request<{ workspace: Settings }>(`/api/workspaces/${workspaceId}`).then(result => {
      setSettings(result.workspace);
      setName(result.workspace.name);
      setDomains(result.workspace.allowedEmailDomains.join(", "));
    }).catch(cause => setError(messageOf(cause)));
    request<{ analytics: Analytics }>(`/api/workspaces/${workspaceId}/analytics`).then(result => setAnalytics(result.analytics)).catch(cause => setError(messageOf(cause)));
  }, [workspaceId]);

  const save = (body: Partial<Settings>, done: string, saving: typeof rename) => void saving.run(async () => {
    const result = await request<{ workspace: Settings }>(`/api/workspaces/${workspaceId}`, { method: "PATCH", body: JSON.stringify(body) });
    setSettings(result.workspace); router.refresh();
    return done;
  });

  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!settings) return <SkeletonList label="Loading workspace settings…" height={140} />;
  const peak = Math.max(1, ...(analytics?.daily.map(day => day.messages) ?? [0]));
  const busiest = analytics?.daily.reduce((top, day) => (day.messages > top.messages ? day : top), analytics.daily[0]);
  const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return <>
    <Section title="Workspace name" description="Shown in the sidebar, in invitations and to everyone in the workspace.">
      <form className={styles.form} onSubmit={event => { event.preventDefault(); save({ name }, "Workspace renamed.", rename); }}>
        <label>Name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <div className={styles.actions}><Button variant="primary" disabled={rename.busy || !name.trim() || name.trim() === settings.name}>{rename.busy ? "Renaming…" : "Rename"}</Button>{rename.feedback}</div>
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
    <Section title="Who can join" description="Limit invites and added members to certain email domains, and optionally require Google sign-in.">
      <form className={styles.form} onSubmit={event => { event.preventDefault(); save({ allowedEmailDomains: domains.split(/[\s,]+/).filter(Boolean) }, "Allowed email domains updated.", join); }}>
        <label>Allowed email domains<Input value={domains} onChange={event => setDomains(event.target.value)} placeholder="acme.com, contractor.acme.com" /></label>
        <p className={styles.hint}>Leave empty to allow any domain. Invites and added members must match.</p>
        <div className={styles.actions}><Button variant="primary" disabled={join.busy}>Save domains</Button></div>
      </form>
      <label className={styles.switchRow}>
        <span><strong>Require Google sign-in</strong><small>New members must join with Google. Password-only invites are blocked.</small></span>
        <input type="checkbox" role="switch" checked={settings.requireGoogleSignIn} disabled={join.busy}
          onChange={event => save({ requireGoogleSignIn: event.target.checked }, event.target.checked ? "Google sign-in is required for new members." : "Password sign-in is allowed again.", join)} />
      </label>
      {join.feedback}
    </Section>
    <EmojiAdmin workspaceId={workspaceId} />
    <Section title="Usage" description="Activity in this workspace. Deleted messages are not counted.">
      {!analytics ? <SkeletonList label="Loading usage…" rows={2} height={72} /> : <>
        <dl className={styles.stats}>
          <div><dt>Members</dt><dd>{analytics.members}</dd><small>{analytics.newMembers} joined in 30 days</small></div>
          <div><dt>Active this week</dt><dd>{analytics.activeMembers.week}</dd><small>{analytics.activeMembers.month} in 30 days</small></div>
          <div><dt>Messages this week</dt><dd>{analytics.messages.week}</dd><small>{analytics.messages.month} in 30 days</small></div>
          <div><dt>Tickets in 30 days</dt><dd>{analytics.tickets.created}</dd><small>{analytics.tickets.completed} completed</small></div>
          <div><dt>Open channels</dt><dd>{analytics.channels}</dd></div>
        </dl>
        <figure className={styles.daily}>
          <div aria-hidden="true">{analytics.daily.map(day => <span key={day.date} title={`${dayName(day.date)}: ${day.messages} messages`} style={{ height: `${Math.round((day.messages / peak) * 100)}%` }} />)}</div>
          <figcaption>Messages per day, last 14 days. {busiest && busiest.messages > 0 ? `Busiest: ${dayName(busiest.date)}, ${busiest.messages} ${busiest.messages === 1 ? "message" : "messages"}.` : "No messages yet."}</figcaption>
        </figure>
      </>}
    </Section>
    <Section title="Export data" description="Download members, public channels with their messages, and projects with their tickets as a JSON file. Private channels and direct messages are not included.">
      <a className={styles.download} href={`/api/workspaces/${workspaceId}/export`} download><Download size={15} aria-hidden="true" /> Download export</a>
    </Section>
  </>;
}

function EmojiAdmin({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<Array<{ shortcode: string; url: string }>>([]);
  const [shortcode, setShortcode] = useState("");
  const [error, setError] = useState("");
  const saving = useSaving();
  const load = useCallback(() => { request<{ emoji: Array<{ shortcode: string; url: string }> }>(`/api/workspaces/${workspaceId}/emoji`).then(result => setItems(result.emoji)).catch(cause => setError(messageOf(cause))); }, [workspaceId]);
  useEffect(() => { load(); }, [load]);
  const upload = (file: File | undefined) => {
    if (!file || !shortcode) return;
    void saving.run(async () => {
      const body = new FormData();
      body.append("file", file);
      body.append("shortcode", shortcode);
      const response = await fetch(`/api/workspaces/${workspaceId}/emoji`, { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The emoji could not be uploaded.");
      setShortcode("");
      load();
      return `:${result.emoji?.shortcode ?? shortcode}: added.`;
    });
  };
  const remove = (code: string) => void saving.run(async () => {
    await request(`/api/workspaces/${workspaceId}/emoji/${code}`, { method: "DELETE" });
    load();
    return `:${code}: removed.`;
  });
  return <Section title="Custom emoji" description="Workspace emoji appear in the composer and as reactions. PNG, JPEG, GIF or WebP, up to 2 MB.">
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <form className={styles.form} onSubmit={event => event.preventDefault()}>
      <label>Shortcode<Input value={shortcode} onChange={event => setShortcode(event.target.value.toLowerCase())} placeholder="party-parrot" maxLength={32} /></label>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} />
    </form>
    {saving.feedback}
    <ul className={styles.workspaces}>
      {items.map(item => <li key={item.shortcode}><span><strong>:{item.shortcode}:</strong></span><Button type="button" variant="quiet" onClick={() => remove(item.shortcode)}>Remove</Button></li>)}
    </ul>
  </Section>;
}
