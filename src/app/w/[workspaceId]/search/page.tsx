import Link from "next/link";
import { searchWorkspace } from "@/features/search/service";
import { trackerHref } from "@/features/tickets/ui";
import { requireWorkspaceUser } from "@/lib/workspace-context";
import styles from "@/features/search/Search.module.css";

export const instant = false;

// Results for the search box in the header: tickets, pages and messages this person can see.
export default async function WorkspaceSearchPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  const query = ((await searchParams).q ?? "").trim();
  const results = query.length >= 2 ? await searchWorkspace(user.id, workspaceId, { query: query.slice(0, 200) }) : [];
  const groups = [
    { title: "Tickets", items: results.flatMap(item => item.type === "ticket" ? [{ ...item, href: trackerHref("board", { workspaceId, projectId: item.projectId, boardId: item.boardId, ticket: item.id }), label: item.title, meta: item.status }] : []) },
    { title: "Pages", items: results.flatMap(item => item.type === "doc" ? [{ ...item, href: `/w/${workspaceId}/docs?projectId=${item.projectId}&doc=${item.id}`, label: item.title, meta: item.project }] : []) },
    { title: "Messages", items: results.flatMap(item => item.type === "message" ? [{ ...item, href: `/w/${workspaceId}/chat`, label: `#${item.channel}`, meta: item.sender }] : []) },
  ].filter(group => group.items.length);

  return <div className={styles.page}>
    <span className={styles.eyebrow}>SEARCH</span>
    <h1>{query ? `Results for “${query}”` : "Search"}</h1>
    {query.length < 2 && <p className={styles.notice}>Type at least 2 characters in the search box above.</p>}
    {query.length >= 2 && !groups.length && <p className={styles.notice}>Nothing matched. Only tickets and pages in projects you can open, and messages in channels you have joined, are searched.</p>}
    {groups.map(group => <section key={group.title} className={styles.group} aria-label={group.title}>
      <h2>{group.title} ({group.items.length})</h2>
      <ul>{group.items.map(item => <li key={item.id}>
        <Link href={item.href}>{item.label}</Link>
        <p>{item.meta}{item.snippet ? ` · ${item.snippet}` : ""}</p>
      </li>)}</ul>
    </section>)}
  </div>;
}
