import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { docSearchSchema } from "../../lib/validation";
import { searchDocs, snippetOf } from "../docs/service";

const PER_KIND = 8;
const MAX_WORDS = 6;

export type WorkspaceSearchResult =
  | { type: "ticket"; id: string; title: string; snippet: string; score: number; key: string; projectId: string; boardId: string; status: string }
  | { type: "doc"; id: string; title: string; snippet: string; score: number; projectId: string; project: string }
  | { type: "message"; id: string; title: string; snippet: string; score: number; channel: string; sender: string; createdAt: string };

// Every word must appear in the field, in any order and ignoring case.
const allWords = (words: string[], fields: string[]) =>
  words.map(word => ({ OR: fields.map(field => ({ [field]: { contains: word, mode: "insensitive" } })) }));

// One search across tickets, pages and chat messages, limited to what the caller can see:
// tickets and pages in projects they can open, messages in channels they have joined.
export async function searchWorkspace(userId: string, workspaceId: string, input: unknown): Promise<WorkspaceSearchResult[]> {
  const { query } = docSearchSchema.parse(input);
  await requireWorkspace(userId, workspaceId);
  const words = query.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const lower = query.toLowerCase();
  const visibleProject = { workspaceId, access: { some: { userId } } } satisfies Prisma.ProjectWhereInput;

  const [tickets, docs, messages] = await Promise.all([
    db.ticket.findMany({
      where: { project: visibleProject, AND: allWords(words, ["title", "description"]) as Prisma.TicketWhereInput[] },
      select: { id: true, key: true, title: true, description: true, projectId: true, boardId: true, column: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: PER_KIND,
    }),
    searchDocs(userId, workspaceId, { query }),
    db.message.findMany({
      where: { channel: { workspaceId, members: { some: { userId } } }, AND: allWords(words, ["body"]) as Prisma.MessageWhereInput[] },
      select: { id: true, body: true, createdAt: true, channel: { select: { name: true } }, sender: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PER_KIND,
    }),
  ]);

  const results: WorkspaceSearchResult[] = [
    ...tickets.map(ticket => ({
      type: "ticket" as const, id: ticket.id, key: ticket.key, title: `${ticket.key} ${ticket.title}`, projectId: ticket.projectId, boardId: ticket.boardId,
      status: ticket.column.name, snippet: snippetOf(ticket.description, query), score: ticket.title.toLowerCase().includes(lower) ? 1 : 0.6,
    })),
    ...docs.slice(0, PER_KIND).map(doc => ({ type: "doc" as const, id: doc.id, title: doc.title, projectId: doc.projectId, project: doc.projectName, snippet: doc.snippet, score: Math.min(1, doc.score) })),
    ...messages.map(message => ({
      type: "message" as const, id: message.id, title: `#${message.channel.name} · ${message.sender.name ?? "Member"}`, channel: message.channel.name,
      sender: message.sender.name ?? "Member", createdAt: message.createdAt.toISOString(), snippet: snippetOf(message.body, query), score: 0.5,
    })),
  ];
  return results.sort((a, b) => b.score - a.score);
}
