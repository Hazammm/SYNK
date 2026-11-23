"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Trash2, Webhook } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { messageOf, request } from "@/lib/client-http";
import type { ChannelSummary } from "@/lib/chat-types";
import styles from "./Apps.module.css";

type AppItem = { id: string; kind: "webhook" | "codehost"; name: string; detail: string; channelId: string | null; lastUsedAt: string | null };
type Created = { id: string; name: string; channelId: string; url: string; token: string };

export default function AppsView({ workspaceId }: { workspaceId: string }) {
  const [apps, setApps] = useState<AppItem[] | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [name, setName] = useState("Incoming webhook");
  const [channelId, setChannelId] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    request<{ apps: AppItem[] }>(`/api/workspaces/${workspaceId}/apps`).then(result => setApps(result.apps)).catch(cause => setError(messageOf(cause)));
    request<{ channels: ChannelSummary[] }>(`/api/workspaces/${workspaceId}/channels`).then(result => {
      const listed = result.channels.filter(channel => channel.type === "PUBLIC" || channel.type === "PRIVATE");
      setChannels(listed);
      setChannelId(current => current || listed.find(channel => channel.isDefault)?.id || listed[0]?.id || "");
    }).catch(cause => setError(messageOf(cause)));
  };
  useEffect(() => { load(); }, [workspaceId]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!channelId) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ webhook: Created }>(`/api/workspaces/${workspaceId}/apps`, { method: "POST", body: JSON.stringify({ name, channelId }) });
      setCreated(result.webhook);
      setName("Incoming webhook");
      load();
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this incoming webhook? Its URL will stop working.")) return;
    try {
      await request(`/api/workspaces/${workspaceId}/apps/${id}`, { method: "DELETE" });
      setCreated(current => current?.id === id ? null : current);
      load();
    } catch (cause) { setError(messageOf(cause)); }
  };

  return <div className={styles.page}>
    <header><h1>Incoming webhooks</h1><p>Post a message into a channel from CI or another tool. GitHub and Bitbucket links stay on the project.</p></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <section className={styles.card}>
      <h2>Webhooks</h2>
      <p>POST JSON <code>{`{ "text": "Hello from CI" }`}</code> to the URL. The message appears in the chosen channel, labelled with the webhook name.</p>
      <form className={styles.form} onSubmit={event => void create(event)}>
        <label>Name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Channel<select required value={channelId} onChange={event => setChannelId(event.target.value)}>
          {channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
        </select></label>
        <Button variant="primary" disabled={busy || !channelId}><Plus size={15} /> Create webhook</Button>
      </form>
      {created && <div className={styles.secret}>
        <p>Copy this URL now. Synk will not show the token again.</p>
        <code>{created.url}</code>
        <Button type="button" onClick={() => void navigator.clipboard.writeText(created.url)}><Copy size={14} /> Copy URL</Button>
      </div>}
    </section>
    <ul className={styles.list}>
      {(apps ?? []).map(app => <li key={`${app.kind}-${app.id}`}>
        <Webhook size={18} aria-hidden="true" />
        <div><strong>{app.name}</strong><small>{app.detail}{app.lastUsedAt ? ` · last used ${new Date(app.lastUsedAt).toLocaleString()}` : ""}</small></div>
        {app.kind === "webhook" && <Button type="button" variant="quiet" onClick={() => void remove(app.id)} aria-label={`Remove ${app.name}`}><Trash2 size={14} /></Button>}
      </li>)}
    </ul>
    {apps && apps.length === 0 && <p className={styles.muted}>No webhooks yet. Create one above, or link GitHub or Bitbucket from a project.</p>}
  </div>;
}
