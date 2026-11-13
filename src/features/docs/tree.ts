// Pure helpers for the page tree, kept apart from React so they can be unit tested.
import type { DocSummary } from "@/lib/doc-types";

export type TreeNode = DocSummary & { children: TreeNode[] };

export function buildTree(docs: DocSummary[]): TreeNode[] {
  const nodes = new Map(docs.map(doc => [doc.id, { ...doc, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) (node.parentId && nodes.get(node.parentId)?.children || roots).push(node);
  return roots;
}
// Every page under `id`, so a page cannot be moved inside itself.
export function descendantsOf(docs: DocSummary[], id: string) {
  const found = new Set<string>([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const doc of docs) if (doc.parentId && found.has(doc.parentId) && !found.has(doc.id)) { found.add(doc.id); grew = true; }
  }
  return found;
}
