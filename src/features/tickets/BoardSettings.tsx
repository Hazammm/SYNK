"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import type { BoardSummary, ProjectDetail } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import Modal from "./Modal";
import styles from "./Tracker.module.css";

// `rowId` is a stable React key; `id` exists only for columns already saved on the board.
type Row = { rowId: string; id?: string; name: string; isDone: boolean };
const DEFAULTS = [["To Do", false], ["In Progress", false], ["Review", false], ["Done", true]] as const;

// Edits an existing board, or creates a new one when `board` is omitted.
export default function BoardSettings({ project, board, onClose, onSaved }: { project: ProjectDetail; board?: BoardSummary; onClose: () => void; onSaved: (board: BoardSummary) => void }) {
  const [name, setName] = useState(board?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => board
    ? board.columns.map(column => ({ rowId: column.id, id: column.id, name: column.name, isDone: column.isDone }))
    : DEFAULTS.map(([columnName, isDone], index) => ({ rowId: `new-${index}`, name: columnName, isDone })));
  const [added, setAdded] = useState<number>(DEFAULTS.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const patch = (rowId: string, change: Partial<Row>) => setRows(rows.map(row => row.rowId === rowId ? { ...row, ...change } : row));
  function move(index: number, by: number) {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setRows(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const columns = rows.map(({ id, name: columnName, isDone }) => ({ ...(id && { id }), name: columnName, isDone }));
    try {
      const result = board
        ? await request<{ board: BoardSummary }>(`/api/boards/${board.id}`, { method: "PATCH", body: JSON.stringify({ name, columns }) })
        : await request<{ board: BoardSummary }>(`/api/projects/${project.id}/boards`, { method: "POST", body: JSON.stringify({ name, columns }) });
      onSaved(result.board);
    } catch (error) { setError(messageOf(error)); setBusy(false); }
  }
  return <Modal className={styles.dialog} label={board ? `Settings for ${board.name}` : "New board"} onClose={onClose}>
    <form className={styles.editor} onSubmit={submit}>
      <header className={styles.drawerHead}><h2>{board ? "Board settings" : "New board"}</h2><button type="button" className={styles.iconButton} aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <label>Board name<Input autoFocus={!board} required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Development" /></label>
      <fieldset className={styles.columnsEditor}>
        <legend>Status columns</legend>
        <p className={styles.muted}>The first column here is the leftmost on the board. Tickets in a “done” column count as completed in sprint progress.</p>
        <ol>{rows.map((row, index) => <li key={row.rowId}>
          <Input required maxLength={40} value={row.name} aria-label={`Column ${index + 1} name`} onChange={event => patch(row.rowId, { name: event.target.value })} />
          <label className={styles.check}><input type="checkbox" checked={row.isDone} onChange={event => patch(row.rowId, { isDone: event.target.checked })} /> Done</label>
          <button type="button" className={styles.iconButton} aria-label={`Move ${row.name || "column"} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" className={styles.iconButton} aria-label={`Move ${row.name || "column"} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button type="button" className={styles.iconButton} aria-label={`Remove ${row.name || "column"}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter(item => item.rowId !== row.rowId))}><Trash2 size={16} /></button>
        </li>)}</ol>
        {rows.length < 12 && <Button type="button" onClick={() => { setRows([...rows, { rowId: `new-${added}`, name: "", isDone: false }]); setAdded(added + 1); }}><Plus size={15} /> Add column</Button>}
      </fieldset>
      {board && <p className={styles.muted}>A column can only be removed once it has no tickets.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><Button variant="primary" disabled={busy}>{busy ? "Saving…" : board ? "Save board" : "Create board"}</Button><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button></div>
    </form>
  </Modal>;
}
