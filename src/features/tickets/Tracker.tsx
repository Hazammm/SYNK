"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderKanban, Plus, ShieldCheck } from "lucide-react";
import { Avatar, Button, Input } from "@/components/Primitives";
import type { WorkspaceSummary } from "@/lib/chat-types";
import type { AccessEntry, ProjectDetail, ProjectLevel, ProjectSummary } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import BoardView from "./BoardView";
import SprintsView from "./SprintsView";
import ReportsView from "../reports/ReportsView";
import { initials, syncUrl, trackerHref, type Selection, type TrackerView } from "./ui";
import styles from "./Tracker.module.css";

const VIEW_TITLES: Record<TrackerView, string> = { board: "Board", sprints: "Sprints", reports: "Sprint reports" };
type Props = { view: TrackerView; userId: string; initialWorkspaces: WorkspaceSummary[]; initial: Selection };

export default function Tracker({ view, userId, initialWorkspaces, initial }: Props) {
  const router = useRouter();
  const [workspaceId] = useState(initialWorkspaces.find(item => item.id === initial.workspaceId)?.id ?? initialWorkspaces[0]?.id ?? "");
  const workspace = initialWorkspaces.find(item => item.id === workspaceId);
  return <div className={styles.tracker}>
    <div className={styles.bar}>
      <div><span className={styles.eyebrow}>ISSUE TRACKING</span><h1>{VIEW_TITLES[view]}</h1></div>
      <label className={styles.picker}>Workspace<select value={workspaceId} onChange={event => router.push(trackerHref(view, { workspaceId: event.target.value }))} disabled={!initialWorkspaces.length}>
        {!initialWorkspaces.length && <option value="">No workspaces yet</option>}
        {initialWorkspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </div>
    {workspace
      // Remounting per workspace resets project state; the initial selection only applies to the workspace it named.
      ? <Projects key={workspace.id} workspace={workspace} view={view} userId={userId} initial={workspace.id === initial.workspaceId ? initial : {}} />
      : <div className={styles.empty}><FolderKanban size={32} /><h2>Create a workspace first</h2><p>Boards live inside a workspace. Create one in chat, or ask an admin to add you.</p><Link href="/chat">Go to chat</Link></div>}
  </div>;
}

function Projects({ workspace, view, userId, initial }: { workspace: WorkspaceSummary; view: TrackerView; userId: string; initial: Selection }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [panel, setPanel] = useState<"create" | "access" | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const isAdmin = workspace.role === "ADMIN";
  const project = projects?.find(item => item.id === projectId);

  useEffect(() => {
    const controller = new AbortController();
    request<{ projects: ProjectSummary[] }>(`/api/workspaces/${workspace.id}/projects`, { signal: controller.signal }).then(result => {
      setProjects(result.projects); setError("");
      setProjectId(current => result.projects.some(item => item.id === current) ? current : result.projects[0]?.id ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [workspace.id, revision]);
  useEffect(() => { if (projects) syncUrl({ workspaceId: workspace.id, projectId }); }, [workspace.id, projectId, projects]);

  const refresh = () => setRevision(value => value + 1);
  return <>
    <div className={styles.subnav}>
      <nav aria-label="Issue tracking views">
        <Link href={trackerHref("board", { workspaceId: workspace.id, projectId })} aria-current={view === "board" ? "page" : undefined}>Board</Link>
        <Link href={trackerHref("sprints", { workspaceId: workspace.id, projectId })} aria-current={view === "sprints" ? "page" : undefined}>Sprints</Link>
        <Link href={trackerHref("reports", { workspaceId: workspace.id, projectId })} aria-current={view === "reports" ? "page" : undefined}>Reports</Link>
      </nav>
      <label className={styles.picker}>Project<select value={projectId} onChange={event => { setProjectId(event.target.value); setPanel(null); }} disabled={!projects?.length}>
        {!projects?.length && <option value="">{projects ? "No projects yet" : "Loading…"}</option>}
        {projects?.map(item => <option key={item.id} value={item.id}>{item.name} ({item.key})</option>)}
      </select></label>
      {isAdmin && project && <Button aria-expanded={panel === "access"} onClick={() => setPanel(panel === "access" ? null : "access")}><ShieldCheck size={15} /> Project access</Button>}
      {isAdmin && <Button aria-expanded={panel === "create"} onClick={() => setPanel(panel === "create" ? null : "create")}><Plus size={15} /> New project</Button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={refresh}>Retry</button></p>}
    {panel === "create" && <CreateProject workspaceId={workspace.id} onCreated={created => { setProjectId(created.id); setPanel(null); refresh(); }} />}
    {panel === "access" && project && <ProjectAccess key={project.id} project={project} onChanged={refresh} />}
    {projects && !projects.length && panel !== "create" && <div className={styles.empty}><FolderKanban size={32} /><h2>No projects yet</h2>
      {isAdmin
        ? <><p>A project holds your boards, tickets and sprints.</p><Button variant="primary" onClick={() => setPanel("create")}><Plus size={15} /> Create the first project</Button></>
        : <p>Ask a workspace admin to create a project or give you access to one.</p>}
    </div>}
    {project && (project.level
      // The revision in the key reloads project details after an access change.
      ? <ProjectArea key={`${project.id}:${revision}`} project={project} view={view} userId={userId} initial={project.id === initial.projectId ? initial : {}} />
      : panel !== "access" && <div className={styles.empty}><ShieldCheck size={32} /><h2>You are not a member of {project.name}</h2><p>Workspace admins can manage every project, but still need access to open its tickets.</p><Button variant="primary" onClick={() => setPanel("access")}>Manage project access</Button></div>)}
  </>;
}

function ProjectArea({ project, view, userId, initial }: { project: ProjectSummary; view: TrackerView; userId: string; initial: Selection }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<{ project: ProjectDetail }>(`/api/projects/${project.id}`, { signal: controller.signal })
      .then(result => { setDetail(result.project); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id, revision]);
  const reload = () => setRevision(value => value + 1);
  if (error) return <p role="alert" className={styles.error}>{error} <button type="button" onClick={reload}>Retry</button></p>;
  if (!detail) return <p role="status" className={styles.loading}>Loading {project.name}…</p>;
  if (view === "reports") return <ReportsView project={detail} initialSprintId={initial.sprintId} />;
  return view === "board"
    ? <BoardView project={detail} userId={userId} initial={initial} onProjectChange={reload} />
    : <SprintsView project={detail} userId={userId} initial={initial} onProjectChange={reload} />;
}

// "Synk FYP" suggests SF; a single word such as "Website" suggests WEB.
function suggestKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean);
  const key = words.length > 1 ? words.map(word => word[0]).join("") : (words[0] ?? "").slice(0, 3);
  return /^[A-Z]/.test(key) ? key.slice(0, 10) : "";
}

function CreateProject({ workspaceId, onCreated }: { workspaceId: string; onCreated: (project: ProjectSummary) => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState<string | null>(null); // null until the person edits the suggestion
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shownKey = key ?? suggestKey(name);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request<{ project: ProjectSummary }>(`/api/workspaces/${workspaceId}/projects`, { method: "POST", body: JSON.stringify({ name, key: shownKey }) });
      onCreated(result.project);
    } catch (error) { setError(messageOf(error)); setBusy(false); }
  }
  return <form className={styles.panel} onSubmit={submit}>
    <h2>Create a project</h2>
    <p>You get a board with To Do, In Progress, Review and Done columns. You can change the columns later.</p>
    <div className={styles.fieldRow}>
      <label>Project name<Input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Synk FYP" /></label>
      <label>Ticket key<Input required maxLength={10} pattern="[A-Za-z][A-Za-z0-9]{1,9}" title="2 to 10 letters or digits, starting with a letter" value={shownKey} onChange={event => setKey(event.target.value.toUpperCase())} placeholder="e.g. SYN" aria-describedby="project-key-hint" /></label>
    </div>
    <p id="project-key-hint">Tickets are numbered with this key, for example {shownKey || "SYN"}-1. It cannot be changed later.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <Button variant="primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
  </form>;
}

const LEVEL_LABELS: Record<ProjectLevel | "NONE", string> = { NONE: "No access", READ: "Can view", WRITE: "Can edit" };

function ProjectAccess({ project, onChanged }: { project: ProjectSummary; onChanged: () => void }) {
  const [entries, setEntries] = useState<AccessEntry[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<{ access: AccessEntry[] }>(`/api/projects/${project.id}/access`, { signal: controller.signal })
      .then(result => setEntries(result.access)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id]);
  async function change(userId: string, level: ProjectLevel | null) {
    setBusy(userId); setError("");
    try {
      await request(`/api/projects/${project.id}/access`, { method: "PUT", body: JSON.stringify({ userId, level }) });
      setEntries(current => current?.map(entry => entry.id === userId ? { ...entry, level } : entry) ?? null);
      onChanged();
    } catch (error) { setError(messageOf(error)); } finally { setBusy(""); }
  }
  return <section className={styles.panel} aria-label={`Access to ${project.name}`}>
    <h2>Who can open {project.name}</h2>
    <p>People with “Can view” see tickets. “Can edit” also lets them create, move and comment. Removing access unassigns their tickets in this project.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!entries && !error && <p role="status">Loading members…</p>}
    <ul className={styles.people}>{entries?.map(entry => <li key={entry.id}>
      <Avatar small initials={initials(entry.name)} />
      <span><strong>{entry.name ?? "Member"}</strong><small>{entry.email} · workspace {entry.role.toLowerCase()}</small></span>
      <select aria-label={`Access for ${entry.name ?? entry.email}`} value={entry.level ?? "NONE"} disabled={busy === entry.id}
        onChange={event => void change(entry.id, event.target.value === "NONE" ? null : event.target.value as ProjectLevel)}>
        {(["NONE", "READ", "WRITE"] as const).map(level => <option key={level} value={level}>{LEVEL_LABELS[level]}</option>)}
      </select>
    </li>)}</ul>
  </section>;
}
