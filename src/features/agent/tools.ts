import type { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireWorkspace } from "../../lib/permissions";
import { rateLimit } from "../../lib/rate-limit";
import { getProject, listProjects } from "../projects/service";
import { createTicket, findTicketByKey, getTicket, updateTicket } from "../tickets/service";
import { createDoc } from "../docs/service";
import { searchWorkspace } from "../search/service";
import { isNone, isSelf, matchByName, ticketKeyPattern } from "./resolve";
import type { AgentChange, AgentFailureCode, AgentTarget, AgentToolFailure, AgentToolResult, AgentToolSuccess } from "../../lib/agent-types";
import type { BoardSummary, Priority, ProjectDetail, ProjectSummary, TicketDetail } from "../../lib/ticket-types";

// The tools the AI agent can call. Each one runs as the person talking to the agent and goes
// through the same services, and so the same permission checks, as that person's own requests.
// Adding a tool means adding one entry to `agentTools` and its schema to the agent service.

export type ToolContext = { userId: string; workspaceId: string; conversationId?: string };
// An expected failure the model should explain or ask about, rather than a bug.
export class ToolFailure extends Error {
  constructor(public code: AgentFailureCode, message: string, public candidates?: string[]) { super(message); }
}
type AgentTool = { mutates: boolean; schema: z.ZodType; run: (context: ToolContext, args: never, dryRun: boolean) => Promise<AgentToolSuccess> };
function defineTool<Schema extends z.ZodType>(tool: { mutates: boolean; schema: Schema; run: (context: ToolContext, args: z.infer<Schema>, dryRun: boolean) => Promise<AgentToolSuccess> }): AgentTool {
  return tool as unknown as AgentTool;
}

const MAX_FOUND = 10;
const PRIORITY_LABEL: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
// Models often send null or "" for a field they mean to leave out.
const optional = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(value => value === null || (typeof value === "string" && !value.trim()) ? undefined : value, schema.optional());
const text = (max: number) => z.string().trim().min(1).max(max);
const priority = z.string().trim().toUpperCase().pipe(z.enum(["LOW", "MEDIUM", "HIGH"], "Priority must be low, medium or high."));
const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like 2026-11-30.")
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "That is not a real date.");
const clip = (value: string, length = 80) => !value ? "(empty)" : value.length > length ? `${value.slice(0, length)}…` : value;
const targetOf = (ticket: Pick<TicketDetail, "id" | "key" | "title" | "projectId" | "boardId">): AgentTarget =>
  ({ type: "ticket", id: ticket.id, key: ticket.key, title: ticket.title, projectId: ticket.projectId, boardId: ticket.boardId });

// ── Looking things up by the names people use ────────────────────────────────

async function accessibleProjects({ userId, workspaceId }: ToolContext) {
  const projects = (await listProjects(userId, workspaceId)).filter(project => project.level);
  if (!projects.length) throw new ToolFailure("forbidden", "You don't have access to any project in this workspace. Ask a workspace admin to give you access.");
  return projects;
}

// A project the caller cannot open is reported exactly like one that does not exist.
function pickProject(projects: ProjectSummary[], query?: string) {
  const label = (project: ProjectSummary) => `${project.name} (${project.key})`;
  if (!query) {
    if (projects.length === 1) return projects[0];
    throw new ToolFailure("ambiguous", "Which project should this go in?", projects.map(label));
  }
  const byKey = projects.find(project => project.key === query.trim().toUpperCase());
  const match = byKey ? { kind: "one" as const, item: byKey } : matchByName(projects, query, project => project.name);
  if (match.kind === "one") return match.item;
  if (match.kind === "many") throw new ToolFailure("ambiguous", `More than one project matches “${query}”.`, match.items.map(label));
  throw new ToolFailure("not_found", `I couldn't find a project called “${query}” that you can open.`, projects.map(label));
}

function requireEdit(project: { name: string; level: string | null }) {
  if (project.level !== "WRITE") throw new ToolFailure("forbidden", `You have view-only access to ${project.name}, so I can't change its tickets. Ask a workspace admin for edit access.`);
}

function pickNamed<Item extends { name: string | null }>(items: Item[], query: string, what: string, where: string): Item {
  const match = matchByName(items, query, item => item.name);
  if (match.kind === "one") return match.item;
  const names = (match.kind === "many" ? match.items : items).flatMap(item => item.name ?? []);
  if (match.kind === "many") throw new ToolFailure("ambiguous", `More than one ${what} matches “${query}”.`, names);
  throw new ToolFailure("not_found", `There is no ${what} called “${query}” ${where}.`, names);
}

function pickMember(project: ProjectDetail, query: string, userId: string) {
  const self = isSelf(query) && project.members.find(member => member.id === userId);
  return self || pickNamed(project.members, query, "person", `with access to ${project.name}`);
}
const pickColumn = (board: BoardSummary, query: string) => pickNamed(board.columns, query, "status", `on the ${board.name} board`);
const pickSprint = (project: ProjectDetail, query: string) =>
  pickNamed(project.sprints.filter(sprint => sprint.state !== "COMPLETED"), query, "open sprint", `in ${project.name}`);

// ── create_ticket ────────────────────────────────────────────────────────────

const createTicketTool = defineTool({
  mutates: true,
  schema: z.object({
    title: text(200),
    project: optional(text(80)), board: optional(text(60)),
    description: optional(z.string().trim().max(8000)),
    priority: optional(priority), assignee: optional(text(80)), status: optional(text(40)),
    sprint: optional(text(60)), due_date: optional(date),
  }).strict(),
  async run(context, args, dryRun) {
    const summary = pickProject(await accessibleProjects(context), args.project);
    requireEdit(summary);
    const project = await getProject(context.userId, summary.id);
    const board = args.board ? pickNamed(project.boards, args.board, "board", `in ${project.name}`) : project.boards[0];
    if (!board) throw new ToolFailure("invalid", `${project.name} has no board yet. Create one on the board page first.`);
    const column = args.status ? pickColumn(board, args.status) : board.columns[0];
    const assignee = args.assignee ? pickMember(project, args.assignee, context.userId) : null;
    const sprint = args.sprint ? pickSprint(project, args.sprint) : null;
    const where = `${column.name} on ${project.name}`;
    if (dryRun) return { ok: true, summary: `Ready to create “${args.title}” in ${where}.` };
    const ticket = await createTicket(context.userId, {
      boardId: board.id, columnId: column.id, title: args.title, description: args.description ?? "", priority: args.priority ?? "MEDIUM",
      assigneeId: assignee?.id ?? null, sprintId: sprint?.id ?? null, dueDate: args.due_date ?? null,
    });
    const extras = [assignee && `assigned to ${assignee.name ?? "a member"}`, sprint && `in ${sprint.name}`, args.due_date && `due ${args.due_date}`].filter(Boolean);
    return { ok: true, summary: `Created ${ticket.key} “${ticket.title}” in ${where}${extras.length ? `, ${extras.join(", ")}` : ""}.`, target: targetOf(ticket) };
  },
});

// ── update_ticket ────────────────────────────────────────────────────────────

const updateTicketTool = defineTool({
  mutates: true,
  schema: z.object({
    ticket: z.string().trim().regex(ticketKeyPattern, "Give the ticket key, for example SYN-12.").transform(value => value.toUpperCase()),
    title: optional(text(200)), description: optional(z.string().trim().max(8000)),
    priority: optional(priority), status: optional(text(40)),
    // "none" clears the assignee, sprint or due date.
    assignee: optional(text(80)), sprint: optional(text(60)), due_date: optional(z.union([date, z.literal("none")])),
  }).strict().refine(args => Object.keys(args).some(key => key !== "ticket" && args[key as keyof typeof args] !== undefined), "Say what to change on the ticket."),
  async run(context, args, dryRun) {
    const found = await findTicketByKey(context.userId, context.workspaceId, args.ticket);
    if (!found) throw new ToolFailure("not_found", `I couldn't find ${args.ticket} in this workspace, or you don't have access to it.`);
    const [ticket, project] = await Promise.all([getTicket(context.userId, found.id), getProject(context.userId, found.projectId)]);
    requireEdit(project);
    const board = project.boards.find(item => item.id === ticket.boardId)!;
    const patch: Record<string, unknown> = {};
    const changes: AgentChange[] = [];
    const change = (field: string, label: string, value: unknown, changed: boolean, from: string, to: string) => {
      if (changed) { patch[field] = value; changes.push({ field: label, from, to }); }
    };

    if (args.title !== undefined) change("title", "Title", args.title, args.title !== ticket.title, ticket.title, args.title);
    if (args.description !== undefined) change("description", "Description", args.description, args.description !== ticket.description, clip(ticket.description), clip(args.description));
    if (args.priority) change("priority", "Priority", args.priority, args.priority !== ticket.priority, PRIORITY_LABEL[ticket.priority], PRIORITY_LABEL[args.priority]);
    if (args.status) {
      const column = pickColumn(board, args.status);
      change("columnId", "Status", column.id, column.id !== ticket.columnId, board.columns.find(item => item.id === ticket.columnId)?.name ?? "Unknown", column.name);
    }
    if (args.assignee) {
      const assignee = isNone(args.assignee) ? null : pickMember(project, args.assignee, context.userId);
      change("assigneeId", "Assignee", assignee?.id ?? null, (assignee?.id ?? null) !== (ticket.assignee?.id ?? null), ticket.assignee?.name ?? "Unassigned", assignee ? assignee.name ?? "Member" : "Unassigned");
    }
    if (args.sprint) {
      const sprint = isNone(args.sprint) ? null : pickSprint(project, args.sprint);
      const current = project.sprints.find(item => item.id === ticket.sprintId)?.name ?? "Backlog";
      change("sprintId", "Sprint", sprint?.id ?? null, (sprint?.id ?? null) !== ticket.sprintId, current, sprint?.name ?? "Backlog");
    }
    if (args.due_date) {
      const due = args.due_date === "none" ? null : args.due_date;
      change("dueDate", "Due date", due, due !== ticket.dueDate, ticket.dueDate ?? "None", due ?? "None");
    }

    const target = targetOf(ticket);
    if (!changes.length) return { ok: true, summary: `${ticket.key} already has those values, so nothing was changed.`, target };
    const list = changes.map(item => `${item.field.toLowerCase()} ${item.from} → ${item.to}`).join("; ");
    // The dry run is what the person is shown before they confirm.
    if (dryRun) return { ok: true, summary: `Update ${ticket.key} “${ticket.title}”: ${list}.`, target, preview: { changes } };
    return { ok: true, summary: `Updated ${ticket.key}: ${list}.`, target: targetOf(await updateTicket(context.userId, ticket.id, patch)) };
  },
});

// ── find_tickets ─────────────────────────────────────────────────────────────

const findTicketsTool = defineTool({
  mutates: false,
  schema: z.object({
    query: optional(text(120)), project: optional(text(80)), assignee: optional(text(80)), status: optional(text(40)),
  }).strict(),
  async run({ userId, workspaceId }, args) {
    // Only projects the caller can open, checked again here because this reads the database directly.
    const filters: Prisma.TicketWhereInput[] = [{ project: { workspaceId, access: { some: { userId } }, workspace: { memberships: { some: { userId } } } } }];
    if (args.query && ticketKeyPattern.test(args.query)) filters.push({ key: args.query.toUpperCase() });
    // Every word must appear in the title or description, in any order.
    else for (const word of (args.query ?? "").split(/\s+/).filter(Boolean).slice(0, 6)) {
      filters.push({ OR: [{ title: { contains: word, mode: "insensitive" } }, { description: { contains: word, mode: "insensitive" } }] });
    }
    if (args.project) filters.push({ project: { OR: [{ key: args.project.toUpperCase() }, { name: { contains: args.project, mode: "insensitive" } }] } });
    if (args.status) filters.push({ column: { name: { equals: args.status, mode: "insensitive" } } });
    if (args.assignee) filters.push(isSelf(args.assignee) ? { assigneeId: userId } : isNone(args.assignee) ? { assigneeId: null } : { assignee: { name: { contains: args.assignee, mode: "insensitive" } } });
    const rows = await db.ticket.findMany({
      where: { AND: filters }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: MAX_FOUND + 1,
      select: { key: true, title: true, priority: true, dueDate: true, column: { select: { name: true } }, assignee: { select: { name: true } }, project: { select: { name: true } } },
    });
    const tickets = rows.slice(0, MAX_FOUND).map(row => ({
      key: row.key, title: row.title, status: row.column.name, priority: PRIORITY_LABEL[row.priority], assignee: row.assignee?.name ?? "Unassigned",
      project: row.project.name, due_date: row.dueDate?.toISOString().slice(0, 10) ?? null,
    }));
    const count = tickets.length === 1 ? "1 ticket" : `${tickets.length} tickets`;
    return { ok: true, summary: rows.length > MAX_FOUND ? `Found more than ${MAX_FOUND} tickets; showing the ${MAX_FOUND} most recently updated.` : `Found ${count}.`, data: { tickets } };
  },
});

// ── create_doc ───────────────────────────────────────────────────────────────

const createDocTool = defineTool({
  mutates: true,
  schema: z.object({
    title: text(150), content: optional(z.string().max(100_000)),
    project: optional(text(80)),
    // The title of an existing page to put the new one under.
    parent: optional(text(150)),
  }).strict(),
  async run(context, args, dryRun) {
    const project = pickProject(await accessibleProjects(context), args.project);
    if (project.level !== "WRITE") throw new ToolFailure("forbidden", `You have view-only access to ${project.name}, so I can't add pages to it. Ask a workspace admin for edit access.`);
    const parent = args.parent ? pickNamed(await db.doc.findMany({ where: { projectId: project.id }, select: { id: true, title: true } }).then(pages => pages.map(page => ({ ...page, name: page.title }))), args.parent, "page", `in ${project.name}`) : null;
    const where = parent ? `under “${parent.title}” in ${project.name}` : `in ${project.name}`;
    if (dryRun) return { ok: true, summary: `Ready to create the page “${args.title}” ${where}.` };
    const doc = await createDoc(context.userId, project.id, { title: args.title, content: args.content ?? "", parentId: parent?.id ?? null });
    return { ok: true, summary: `Created the page “${doc.title}” ${where}.`, target: { type: "doc", id: doc.id, title: doc.title, projectId: doc.projectId } };
  },
});

// ── search_workspace ─────────────────────────────────────────────────────────

const searchWorkspaceTool = defineTool({
  mutates: false,
  schema: z.object({ query: text(200) }).strict(),
  async run({ userId, workspaceId }, args) {
    const results = await searchWorkspace(userId, workspaceId, { query: args.query });
    const counts = (["ticket", "doc", "message"] as const).map(type => [type, results.filter(result => result.type === type).length] as const);
    const label = { ticket: ["ticket", "tickets"], doc: ["page", "pages"], message: ["message", "messages"] };
    const found = counts.filter(([, count]) => count).map(([type, count]) => `${count} ${label[type][count === 1 ? 0 : 1]}`);
    return {
      ok: true, summary: found.length ? `Found ${found.join(", ")} matching “${args.query}”.` : `Nothing matched “${args.query}”.`,
      data: { results: results.map(({ score, ...result }) => ({ ...result, score: Math.round(score * 100) / 100 })) },
    };
  },
});

export const agentTools: Record<string, AgentTool> = {
  create_ticket: createTicketTool,
  update_ticket: updateTicketTool,
  find_tickets: findTicketsTool,
  create_doc: createDocTool,
  search_workspace: searchWorkspaceTool,
};

// ── Running a tool for the agent ─────────────────────────────────────────────

const toolCallSchema = z.object({ args: z.record(z.string(), z.unknown()).default({}), dryRun: z.boolean().default(false) }).strict();

// Expected failures become results the model can explain. Anything else is a bug and propagates.
function failureOf(error: unknown): AgentToolFailure {
  if (error instanceof ToolFailure) return { ok: false, code: error.code, message: error.message, ...(error.candidates?.length && { candidates: error.candidates.slice(0, 20) }) };
  if (error instanceof ZodError) return { ok: false, code: "invalid", message: error.issues[0]?.message ?? "Those details are not valid." };
  if (error instanceof AppError) {
    const code: AgentFailureCode = error.status === 403 ? "forbidden" : error.status === 404 ? "not_found" : error.status === 429 ? "rate_limited" : "invalid";
    if (error.status < 500) return { ok: false, code, message: error.message };
  }
  throw error;
}

// The single entry point between the agent and every tool: it checks workspace membership,
// runs the tool as that person, and records the attempt in the action log, denials included.
export async function runAgentTool(context: ToolContext, name: string, input: unknown): Promise<AgentToolResult> {
  const tool = agentTools[name];
  if (!tool) throw new AppError(404, "Unknown tool.");
  const { args, dryRun } = toolCallSchema.parse(input);
  let result: AgentToolResult;
  try {
    rateLimit(`agent-tool:${context.userId}`, 60);
    await requireWorkspace(context.userId, context.workspaceId);
    result = await tool.run(context, tool.schema.parse(args) as never, dryRun);
  } catch (error) { result = failureOf(error); }
  await db.actionLog.create({
    data: {
      userId: context.userId, workspaceId: context.workspaceId, conversationId: context.conversationId ?? null, tool: name, dryRun, ok: result.ok,
      target: !result.ok || !result.target ? null : result.target.type === "ticket" ? result.target.key : `doc:${result.target.id}`, parameters: args as Prisma.InputJsonObject,
      result: result.ok ? { summary: result.summary } : { code: result.code, message: result.message },
    },
  });
  return result;
}
