// Shapes shared by the docs API and its client components.
import type { Person } from "./ticket-types";

// A page in the tree, without its content.
export type DocSummary = { id: string; parentId: string | null; title: string; position: number; lastEditedAt: string; lastEditedBy: Person | null };
export type DocDetail = DocSummary & {
  projectId: string; content: string; version: number; createdAt: string; createdBy: Person | null;
  // Whether the reader may edit, move and delete this page.
  canEdit: boolean;
};
export type DocSearchResult = { id: string; projectId: string; projectName: string; title: string; snippet: string; score: number; lastEditedAt: string };
