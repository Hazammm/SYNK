"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { GitPullRequest, Link2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/Primitives";
import { messageOf, request } from "@/lib/client-http";
import { CODE_HOSTS, type CodeHost, type HostConnection, type LinkedRepository, type RemoteRepository, type SyncResult } from "@/lib/code-host-types";
import type { ProjectSummary } from "@/lib/ticket-types";
import styles from "@/features/tickets/Tracker.module.css";

// GitHub grants repository access only when the sign-in asks for it; Bitbucket's access is set on its OAuth consumer.
const CONNECT_SCOPE: Partial<Record<CodeHost, string>> = { GITHUB: "read:user user:email repo", BITBUCKET: "account email repository pullrequest" };

// Workspace admins link GitHub or Bitbucket repositories to a project here.
export default function RepositoriesPanel({ project }: { project: ProjectSummary }) {
  const [repositories, setRepositories] = useState<LinkedRepository[] | null>(null);
  const [connections, setConnections] = useState<HostConnection[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      request<{ repositories: LinkedRepository[] }>(`/api/projects/${project.id}/repositories`, { signal: controller.signal }),
      request<{ connections: HostConnection[] }>("/api/integrations", { signal: controller.signal }),
    ]).then(([linked, hosts]) => { setRepositories(linked.repositories); setConnections(hosts.connections); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id]);

  async function run(id: string, action: () => Promise<string>) {
    setBusy(id); setError(""); setNotice("");
    try { setNotice(await action()); } catch (error) { setError(messageOf(error)); } finally { setBusy(""); }
  }
  const sync = (repository: LinkedRepository) => run(repository.id, async () => {
    const result = await request<SyncResult>(`/api/repositories/${repository.id}/sync`, { method: "POST" });
    const refreshed = await request<{ repositories: LinkedRepository[] }>(`/api/projects/${project.id}/repositories`);
    setRepositories(refreshed.repositories);
    return `Checked ${result.scanned} pull ${result.scanned === 1 ? "request" : "requests"} in ${repository.fullName}; ${result.linked} newly attached to tickets.`;
  });
  const unlink = (repository: LinkedRepository) => {
    if (!window.confirm(`Unlink ${repository.fullName}? Its pull requests are removed from this project's tickets. The repository itself is not changed.`)) return;
    void run(repository.id, async () => {
      await request(`/api/repositories/${repository.id}`, { method: "DELETE" });
      setRepositories(current => current?.filter(item => item.id !== repository.id) ?? null);
      return `${repository.fullName} was unlinked.`;
    });
  };

  return <section className={styles.panel} aria-label={`Repositories for ${project.name}`}>
    <h2>Repositories for {project.name}</h2>
    <p>A pull request with a ticket key such as {project.key}-12 in its title or branch name appears on that ticket, with its status.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!repositories && !error && <p role="status">Loading repositories…</p>}
    {repositories && !repositories.length && <p>No repository is linked to this project yet.</p>}
    <ul className={styles.people}>{repositories?.map(repository => <li key={repository.id}>
      <GitPullRequest size={18} aria-hidden="true" />
      <span>
        <strong><a href={repository.url} target="_blank" rel="noreferrer">{repository.fullName}</a></strong>
        <small>{CODE_HOSTS[repository.provider].label} · {repository.pullRequestCount} pull {repository.pullRequestCount === 1 ? "request" : "requests"} on tickets{repository.connectedBy ? ` · linked by ${repository.connectedBy}` : ""}</small>
      </span>
      <Button disabled={busy === repository.id} onClick={() => void sync(repository)}><RefreshCw size={15} /> {busy === repository.id ? "Working…" : "Sync now"}</Button>
      <Button variant="quiet" className={styles.danger} disabled={busy === repository.id} onClick={() => unlink(repository)}><Trash2 size={15} /> Unlink</Button>
      {repository.webhook && <details className={styles.webhook}>
        <summary>Set up live updates (webhook)</summary>
        <p>Without a webhook, pull requests update when someone presses Sync now. To update them as they change, add a webhook in the repository&apos;s settings on {CODE_HOSTS[repository.provider].label}, for pull request events, with content type <code>application/json</code>. The address must be reachable from the internet.</p>
        <dl><dt>URL</dt><dd><code>{repository.webhook.url}</code></dd><dt>Secret</dt><dd><code>{repository.webhook.secret}</code></dd></dl>
      </details>}
    </li>)}</ul>
    {connections && repositories && <LinkForm key={project.id} projectId={project.id} connections={connections} linked={repositories}
      onLinked={repository => { setRepositories(current => [...(current ?? []), repository]); setNotice(`${repository.fullName} is linked. Press Sync now to bring in its pull requests.`); }} />}
  </section>;
}

function LinkForm({ projectId, connections, linked, onLinked }: { projectId: string; connections: HostConnection[]; linked: LinkedRepository[]; onLinked: (repository: LinkedRepository) => void }) {
  const available = connections.filter(connection => connection.available);
  const [provider, setProvider] = useState<CodeHost | "">(available[0]?.provider ?? "");
  const [remote, setRemote] = useState<RemoteRepository[] | null>(null);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connection = available.find(item => item.provider === provider);
  useEffect(() => {
    if (!connection?.connected) return;
    const controller = new AbortController();
    request<{ repositories: RemoteRepository[] }>(`/api/integrations/${connection.provider.toLowerCase()}/repos`, { signal: controller.signal })
      .then(result => { setRemote(result.repositories); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [connection?.provider, connection?.connected]);

  if (!connection) return <p>GitHub and Bitbucket sign-in are not set up on this server, so repositories can&apos;t be linked yet. See docs/code-hosts.md.</p>;
  const label = CODE_HOSTS[connection.provider].label;
  const choices = remote?.filter(item => !linked.some(repository => repository.provider === connection.provider && repository.fullName === item.fullName));

  // Signing in again, this time asking for repository access, comes back to this panel.
  function connect() {
    const back = new URL(window.location.href);
    back.searchParams.set("repos", "1");
    const scope = CONNECT_SCOPE[connection!.provider];
    void signIn(CODE_HOSTS[connection!.provider].signInId, { callbackUrl: back.toString() }, scope ? { scope } : undefined);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request<{ repository: LinkedRepository }>(`/api/projects/${projectId}/repositories`, { method: "POST", body: JSON.stringify({ provider: connection!.provider, fullName }) });
      setFullName(""); onLinked(result.repository);
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }

  return <form className={styles.linkForm} onSubmit={submit}>
    <h3>Link a repository</h3>
    <div className={styles.fieldRow}>
      <label>Code host<select value={provider} onChange={event => { setProvider(event.target.value as CodeHost); setRemote(null); setFullName(""); setError(""); }}>
        {available.map(item => <option key={item.provider} value={item.provider}>{CODE_HOSTS[item.provider].label}</option>)}
      </select></label>
      {connection.connected && <label>Repository<select required value={fullName} onChange={event => setFullName(event.target.value)} disabled={!choices}>
        <option value="">{choices ? choices.length ? "Choose a repository" : "No more repositories to link" : "Loading…"}</option>
        {choices?.map(item => <option key={item.fullName} value={item.fullName}>{item.fullName}{item.isPrivate ? " (private)" : ""}</option>)}
      </select></label>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {connection.connected
      ? <Button variant="primary" disabled={busy || !fullName}><Link2 size={15} /> {busy ? "Linking…" : "Link repository"}</Button>
      : <><p>Connect your {label} account so Synk can read your repositories and their pull requests. You are sent to {label} to approve it and then brought back here.</p>
        <Button type="button" variant="primary" onClick={connect}>Connect {label}</Button></>}
  </form>;
}
