"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/Primitives";
import type { DocSearchResult } from "@/lib/doc-types";
import { messageOf, request } from "@/lib/client-http";
import styles from "./Docs.module.css";

// Searches every page the reader can open in the workspace. Results open the page, in any project.
export default function SearchBox({ workspaceId, onOpen }: { workspaceId: string; onOpen: (docId: string, projectId: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocSearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true); setError("");
    try { setResults((await request<{ results: DocSearchResult[] }>(`/api/workspaces/${workspaceId}/docs/search?${new URLSearchParams({ query: query.trim() })}`)).results); }
    catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  const clear = () => { setResults(null); setQuery(""); setError(""); };
  return <div className={styles.search}>
    <form role="search" onSubmit={search}>
      <Search size={15} aria-hidden="true" />
      <input type="search" aria-label="Search pages" placeholder="Search pages in this workspace" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} />
      <Button disabled={busy || query.trim().length < 2}>{busy ? "Searching…" : "Search"}</Button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {results && <section className={styles.results} aria-label="Search results">
      <header><span role="status">{results.length ? `${results.length} ${results.length === 1 ? "page" : "pages"} found` : "No pages match."}</span><button type="button" aria-label="Close search results" onClick={clear}><X size={15} /></button></header>
      <ul>{results.map(result => <li key={result.id}><button type="button" onClick={() => { onOpen(result.id, result.projectId); clear(); }}>
        <strong>{result.title}</strong><small>{result.projectName}</small>{result.snippet && <span>{result.snippet}</span>}
      </button></li>)}</ul>
    </section>}
  </div>;
}
