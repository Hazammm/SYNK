"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type { WorkspaceSummary } from "@/lib/chat-types";
import type { ProjectSummary } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import { syncUrl } from "../tickets/ui";
import ProjectDocs, { OPEN_DOC } from "./ProjectDocs";
import SearchBox from "./SearchBox";
import styles from "./Docs.module.css";

type Selection = { workspaceId?: string; projectId?: string; doc?: string };
type Props = { initialWorkspaces: WorkspaceSummary[]; initial: Selection };

export default function DocsView({ initialWorkspaces, initial }: Props) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaces.find(item => item.id === initial.workspaceId)?.id ?? initialWorkspaces[0]?.id ?? "");
  return <div className={styles.page}>
    <div className={styles.bar}>
      <div><span className={styles.eyebrow}>DOCS</span><h1>Pages</h1></div>
      <label className={styles.picker}>Workspace<select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} disabled={!initialWorkspaces.length}>
        {!initialWorkspaces.length && <option value="">No workspaces yet</option>}
        {initialWorkspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </div>
    {workspaceId
      ? <Workspace key={workspaceId} workspaceId={workspaceId} initial={workspaceId === initial.workspaceId ? initial : {}} />
      : <div className={styles.empty}><FileText size={32} /><h2>Create a workspace first</h2><p>Pages live inside a workspace&apos;s projects. Create a workspace in chat, or ask an admin to add you.</p><Link href="/chat">Go to chat</Link></div>}
  </div>;
}

function Workspace({ workspaceId, initial }: { workspaceId: string; initial: Selection }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  // The page to open when a project is shown: from the address bar first, then from search.
  const [requested, setRequested] = useState<Selection>(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<{ projects: ProjectSummary[] }>(`/api/workspaces/${workspaceId}/projects`, { signal: controller.signal }).then(result => {
      // Admins also see projects they have not joined; those pages are not open to them.
      const open = result.projects.filter(project => project.level);
      setProjects(open); setError("");
      setProjectId(current => open.some(project => project.id === current) ? current : open[0]?.id ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [workspaceId]);
  useEffect(() => { if (projects) syncUrl({ workspaceId, projectId }); }, [workspaceId, projectId, projects]);
  const project = projects?.find(item => item.id === projectId);

  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!projects) return <p role="status" className={styles.loading}>Loading projects…</p>;
  if (!project) return <div className={styles.empty}><FileText size={32} /><h2>No projects to write in yet</h2><p>Pages belong to a project. Create a project on the board, or ask a workspace admin for access to one.</p><Link href={`/board?workspaceId=${workspaceId}`}>Go to the board</Link></div>;
  return <>
    <div className={styles.subnav}>
      <label className={styles.picker}>Project<select value={project.id} onChange={event => setProjectId(event.target.value)}>
        {projects.map(item => <option key={item.id} value={item.id}>{item.name} ({item.key})</option>)}
      </select></label>
      <SearchBox workspaceId={workspaceId} onOpen={(id, owner) => {
        if (owner === project.id) window.dispatchEvent(new CustomEvent(OPEN_DOC, { detail: id }));
        else { setRequested({ projectId: owner, doc: id }); setProjectId(owner); }
      }} />
    </div>
    <ProjectDocs key={project.id} workspaceId={workspaceId} project={project} initialDoc={project.id === requested.projectId ? requested.doc : undefined} />
  </>;
}
