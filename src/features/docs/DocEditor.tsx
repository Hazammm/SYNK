"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Code2, FilePlus2, Heading2, Italic, Link2, List, ListChecks, ListOrdered, Quote, Trash2 } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { DocDetail, DocSummary } from "@/lib/doc-types";
import { messageOf, request } from "@/lib/client-http";
import { toggleTask } from "@/lib/markdown";
import { formatDateTime } from "../tickets/ui";
import DocContent from "./DocContent";
import { insertCodeBlock, insertLink, toggleLinePrefix, wrapSelection, type Edit } from "./editing";
import { descendantsOf } from "./tree";
import styles from "./Docs.module.css";

// One page: its title, a Markdown editor with a formatting toolbar, and a preview.
type EditorProps = { docId: string; docs: DocSummary[]; workspaceId: string; onDirty: (dirty: boolean) => void; onSaved: (doc: DocDetail) => void; onAddSubpage: () => void; onDeleted: () => void };

export default function DocEditor({ docId, docs, workspaceId, onDirty, onSaved, onAddSubpage, onDeleted }: EditorProps) {
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("preview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const changed = doc !== null && (title !== doc.title || content !== doc.content);
  useEffect(() => { onDirty(changed); }, [changed, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    request<{ doc: DocDetail }>(`/api/docs/${docId}`, { signal: controller.signal }).then(({ doc }) => {
      setDoc(doc); setTitle(doc.title); setContent(doc.content);
      // A new, empty page opens ready for writing.
      setMode(doc.canEdit && !doc.content ? "write" : "preview");
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [docId]);
  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  async function save(fields: { parentId?: string | null } = {}) {
    if (!doc || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { version: doc.version, ...(title !== doc.title && { title }), ...(content !== doc.content && { content }), ...fields };
      if (Object.keys(body).length === 1) return;
      const { doc: next } = await request<{ doc: DocDetail }>(`/api/docs/${doc.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setDoc(next); setTitle(next.title); setContent(next.content); onSaved(next);
      setNotice(fields.parentId !== undefined ? "Page moved." : "Saved.");
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!doc) return;
    const subpages = descendantsOf(docs, doc.id).size - 1;
    if (!window.confirm(`Delete “${doc.title}”${subpages ? ` and its ${subpages} ${subpages === 1 ? "subpage" : "subpages"}` : ""}? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await request(`/api/docs/${doc.id}`, { method: "DELETE" }); onDeleted(); }
    catch (error) { setError(messageOf(error)); setBusy(false); }
  }
  function apply(edit: (text: string, start: number, end: number) => Edit) {
    const input = field.current;
    if (!input) return;
    const next = edit(content, input.selectionStart, input.selectionEnd);
    setContent(next.text);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(next.start, next.end); });
  }
  function keyDown(event: React.KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    else if (mod && event.key.toLowerCase() === "b") { event.preventDefault(); apply((t, s, e) => wrapSelection(t, s, e, "**")); }
    else if (mod && event.key.toLowerCase() === "i") { event.preventDefault(); apply((t, s, e) => wrapSelection(t, s, e, "*")); }
  }

  if (error && !doc) return <p role="alert" className={styles.error}>{error}</p>;
  if (!doc) return <p role="status" className={styles.loading}>Loading page…</p>;
  const blocked = descendantsOf(docs, doc.id);
  const tools: { label: string; icon: typeof Bold; run: (t: string, s: number, e: number) => Edit }[] = [
    { label: "Bold (Ctrl+B)", icon: Bold, run: (t, s, e) => wrapSelection(t, s, e, "**") },
    { label: "Italic (Ctrl+I)", icon: Italic, run: (t, s, e) => wrapSelection(t, s, e, "*") },
    { label: "Heading", icon: Heading2, run: (t, s, e) => toggleLinePrefix(t, s, e, "## ") },
    { label: "Bulleted list", icon: List, run: (t, s, e) => toggleLinePrefix(t, s, e, "- ") },
    { label: "Numbered list", icon: ListOrdered, run: (t, s, e) => toggleLinePrefix(t, s, e, "1. ") },
    { label: "Checklist", icon: ListChecks, run: (t, s, e) => toggleLinePrefix(t, s, e, "- [ ] ") },
    { label: "Quote", icon: Quote, run: (t, s, e) => toggleLinePrefix(t, s, e, "> ") },
    { label: "Code block", icon: Code2, run: insertCodeBlock },
    { label: "Link", icon: Link2, run: insertLink },
  ];

  return <article className={styles.editor} onKeyDown={doc.canEdit ? keyDown : undefined}>
    <div className={styles.meta}>
      Last edited {formatDateTime(doc.lastEditedAt)}{doc.lastEditedBy && ` by ${doc.lastEditedBy.name ?? "a member"}`}
      {doc.createdBy && <> · Created by {doc.createdBy.name ?? "a member"}</>}
    </div>
    {doc.canEdit
      ? <input className={styles.title} aria-label="Page title" value={title} maxLength={150} onChange={event => setTitle(event.target.value)} placeholder="Untitled" />
      : <h2 className={styles.title}>{doc.title}</h2>}
    {doc.canEdit && <div className={styles.toolbar}>
      <div role="tablist" aria-label="Editor mode" className={styles.modes}>
        {(["write", "preview"] as const).map(item => <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)}>{item === "write" ? "Write" : "Preview"}</button>)}
      </div>
      {mode === "write" && <div role="toolbar" aria-label="Formatting" className={styles.format}>
        {tools.map(({ label, icon: Icon, run }) => <button key={label} type="button" aria-label={label} title={label} onClick={() => apply(run)}><Icon size={15} /></button>)}
      </div>}
      <label className={styles.move}>Parent<select value={doc.parentId ?? ""} disabled={busy || changed} title={changed ? "Save your changes before moving the page." : undefined} onChange={event => void save({ parentId: event.target.value || null })}>
        <option value="">Top level</option>
        {docs.filter(item => !blocked.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
    </div>}
    {doc.canEdit && mode === "write"
      ? <textarea ref={field} className={styles.source} aria-label="Page content" value={content} onChange={event => setContent(event.target.value)} spellCheck
          placeholder={"Write in Markdown:\n# Heading\n- List item\n- [ ] Checklist item\n**bold**, *italic*, `code`, [link](https://example.com)"} />
      : <DocContent source={content} workspaceId={workspaceId} onToggleTask={doc.canEdit ? line => setContent(current => toggleTask(current, line)) : undefined} />}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {doc.canEdit && <div className={styles.actions}>
      <Button variant="primary" disabled={busy || !changed || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
      {changed && <Button variant="quiet" disabled={busy} onClick={() => { setTitle(doc.title); setContent(doc.content); }}>Discard changes</Button>}
      <span role="status" className={styles.notice}>{changed ? "Unsaved changes" : notice}</span>
      <Button className={styles.pushRight} disabled={busy} onClick={onAddSubpage}><FilePlus2 size={15} /> Add subpage</Button>
      <Button variant="quiet" className={styles.danger} disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Delete</Button>
    </div>}
  </article>;
}
