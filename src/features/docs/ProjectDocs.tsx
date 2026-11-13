"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FileText } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { ProjectSummary } from "@/lib/ticket-types";
import type { DocDetail, DocSummary } from "@/lib/doc-types";
import { messageOf, request } from "@/lib/client-http";
import { syncUrl } from "../tickets/ui";
import DocEditor from "./DocEditor";
import DocTree from "./DocTree";
import { buildTree } from "./tree";
import styles from "./Docs.module.css";

// Fired by search to open a page in the project that is already showing.
export const OPEN_DOC = "synk-open-doc";

// A project's page tree and the open page.
export default function ProjectDocs({ workspaceId, project, initialDoc }: { workspaceId: string; project: ProjectSummary; initialDoc?: string }) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [selected, setSelected] = useState(initialDoc ?? "");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = useRef(false);
  const canWrite = project.level === "WRITE";
  useEffect(() => {
    const controller = new AbortController();
    request<{ docs: DocSummary[] }>(`/api/projects/${project.id}/docs`, { signal: controller.signal }).then(result => {
      setDocs(result.docs); setError("");
      setSelected(current => result.docs.some(doc => doc.id === current) ? current : result.docs.find(doc => !doc.parentId)?.id ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id, revision]);
  useEffect(() => { if (docs) syncUrl({ doc: selected || undefined }); }, [selected, docs]);
  // Opening a page from search, which may be in this project.
  const open = useCallback((id: string) => {
    if (id === selected || (dirty.current && !window.confirm("Leave this page? Your unsaved changes will be lost."))) return;
    dirty.current = false; setSelected(id);
  }, [selected]);
  useEffect(() => {
    const handler = (event: Event) => { const id = (event as CustomEvent<string>).detail; if (docs?.some(doc => doc.id === id)) open(id); else setRevision(value => value + 1); };
    window.addEventListener(OPEN_DOC, handler);
    return () => window.removeEventListener(OPEN_DOC, handler);
  }, [docs, open]);
  const tree = useMemo(() => buildTree(docs ?? []), [docs]);

  async function create(parentId: string | null) {
    if (dirty.current && !window.confirm("Leave this page? Your unsaved changes will be lost.")) return;
    try {
      const { doc } = await request<{ doc: DocDetail }>(`/api/projects/${project.id}/docs`, { method: "POST", body: JSON.stringify({ title: "Untitled", parentId }) });
      dirty.current = false;
      setDocs(current => [...(current ?? []), doc]); setSelected(doc.id);
    } catch (error) { setError(messageOf(error)); }
  }
  const saved = (doc: DocDetail) => setDocs(current => current?.map(item => item.id === doc.id ? doc : item) ?? null);

  if (error && !docs) return <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>;
  if (!docs) return <p role="status" className={styles.loading}>Loading pages…</p>;
  return <div className={styles.layout}>
    <nav className={styles.tree} aria-label={`Pages in ${project.name}`}>
      <div className={styles.treeHead}><strong>{project.name}</strong>{canWrite && <button type="button" aria-label="New page" title="New page" onClick={() => void create(null)}><FilePlus2 size={16} /></button>}</div>
      {tree.length ? <DocTree nodes={tree} selected={selected} onSelect={open} /> : <p className={styles.muted}>No pages yet.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </nav>
    <div className={styles.main}>
      {selected
        ? <DocEditor key={selected} docId={selected} docs={docs} workspaceId={workspaceId} onDirty={value => { dirty.current = value; }} onSaved={saved}
            onAddSubpage={() => void create(selected)} onDeleted={() => { dirty.current = false; setSelected(""); setRevision(value => value + 1); }} />
        : <div className={styles.empty}><FileText size={32} /><h2>No pages in {project.name} yet</h2>
            {canWrite ? <><p>Write specs, meeting notes and plans next to your tickets.</p><Button variant="primary" onClick={() => void create(null)}><FilePlus2 size={15} /> Create the first page</Button></> : <p>You have view-only access to this project.</p>}
          </div>}
    </div>
  </div>;
}
