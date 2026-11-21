import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { docSearchSchema, extractPlainText } from "../../lib/validation";
import { searchDocs, snippetOf } from "../docs/service";

const PER_KIND = 8;
const MAX_WORDS = 6;

export type WorkspaceSearchResult =
  | { type: "ticket"; id: string; title: string; snippet: string; score: number; key: string; projectId: string; boardId: string; status: string }
  | { type: "doc"; id: string; title: string; snippet: string; score: number; projectId: string; project: string }
  | { type: "message"; id: string; title: string; snippet: string; score: number; channel: string; channelId?: string; threadRootId?: string | null; sender: string; createdAt: string };

// Slack-style modifiers in a search: from:@name, in:#channel, before:2026-11-01, after:2026-10-01, has:link, has:file.
export type SearchFilters = { text: string; from?: string; in?: string; before?: Date; after?: Date; has: ("link" | "file")[] };
const DAY = 24 * 60 * 60 * 1000;

export function parseSearchQuery(query: string): SearchFilters {
  const filters: SearchFilters = { text: "", has: [] };
  const words: string[] = [];
  for (const [token, key, raw] of query.matchAll(/(?:(\w+):("[^"]*"|\S+))|\S+/g)) {
    const value = raw?.replace(/^"|"$/g, "").trim();
    const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;
    const validDate = date && !Number.isNaN(date.getTime()) ? date : undefined;
    if (key === "from" && value?.replace(/^@/, "")) filters.from = value.replace(/^@/, "");
    else if (key === "in" && value?.replace(/^#/, "")) filters.in = value.replace(/^#/, "").toLowerCase();
    else if (key === "before" && validDate) filters.before = validDate;
    else if (key === "after" && validDate) filters.after = new Date(validDate.getTime() + DAY);
    else if (key === "has" && (value === "link" || value === "file")) filters.has.push(value);
    else words.push(token);
  }
  filters.text = words.join(" ");
  return filters;
}

const hasModifiers = (filters: SearchFilters) => Boolean(filters.from || filters.in || filters.before || filters.after || filters.has.length);

// Every word must appear in the field, in any order and ignoring case.
const allWords = (words: string[], fields: string[]) =>
  words.map(word => ({ OR: fields.map(field => ({ [field]: { contains: word, mode: "insensitive" } })) }));

// One search across tickets, pages and chat messages, limited to what the caller can see:
// tickets and pages in projects they can open, messages in channels they have joined.
export async function searchWorkspace(userId: string, workspaceId: string, input: unknown): Promise<WorkspaceSearchResult[]> {
  const { query: raw } = docSearchSchema.parse(input);
  await requireWorkspace(userId, workspaceId);
  const filters = parseSearchQuery(raw);
  // Modifiers narrow the search to chat messages, as in Slack.
  const messagesOnly = hasModifiers(filters);
  const query = filters.text;
  const words = query.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const lower = query.toLowerCase();
  const visibleProject = { workspaceId, access: { some: { userId } } } satisfies Prisma.ProjectWhereInput;

  const [tickets, docs, messages] = await Promise.all([
    messagesOnly || !words.length ? [] : db.ticket.findMany({
      where: { project: visibleProject, AND: allWords(words, ["title", "description"]) as Prisma.TicketWhereInput[] },
      select: { id: true, key: true, title: true, description: true, projectId: true, boardId: true, column: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: PER_KIND,
    }),
    messagesOnly || query.length < 2 ? [] : searchDocs(userId, workspaceId, { query }),
    db.message.findMany({
      where: {
        deletedAt: null,
        channel: { workspaceId, members: { some: { userId } }, ...(filters.in && { name: { equals: filters.in, mode: "insensitive" } }) },
        ...(filters.from && { author: { OR: [{ name: { contains: filters.from, mode: "insensitive" } }, { email: { startsWith: filters.from, mode: "insensitive" } }] } }),
        ...((filters.before || filters.after) && { createdAt: { ...(filters.before && { lt: filters.before }), ...(filters.after && { gte: filters.after }) } }),
        ...(filters.has.includes("file") && { attachments: { some: {} } }),
        AND: [
          ...(allWords(words, ["body"]) as Prisma.MessageWhereInput[]),
          ...(filters.has.includes("link") ? [{ OR: [{ body: { contains: "http://" } }, { body: { contains: "https://" } }] }] : []),
        ],
      },
      select: { id: true, channelId: true, threadRootId: true, body: true, createdAt: true, channel: { select: { id: true, name: true } }, author: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: messagesOnly ? PER_KIND * 3 : PER_KIND,
    }),
  ]);

  const results: WorkspaceSearchResult[] = [
    ...tickets.map(ticket => ({
      type: "ticket" as const, id: ticket.id, key: ticket.key, title: `${ticket.key} ${ticket.title}`, projectId: ticket.projectId, boardId: ticket.boardId,
      status: ticket.column.name, snippet: snippetOf(ticket.description, query), score: ticket.title.toLowerCase().includes(lower) ? 1 : 0.6,
    })),
    ...docs.slice(0, PER_KIND).map(doc => ({ type: "doc" as const, id: doc.id, title: doc.title, projectId: doc.projectId, project: doc.projectName, snippet: doc.snippet, score: Math.min(1, doc.score) })),
    ...messages.map(message => ({
      type: "message" as const, id: message.id, title: `#${message.channel.name ?? "general"} · ${message.author.name ?? "Member"}`, channel: message.channel.name ?? "general",
      channelId: message.channelId, threadRootId: message.threadRootId, sender: message.author.name ?? "Member", createdAt: message.createdAt.toISOString(), snippet: snippetOf(extractPlainText(message.body), query), score: 0.5,
    })),
  ];
  return results.sort((a, b) => b.score - a.score);
}
