import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireProject, type ProjectAction } from "../../lib/permissions";
import { idSchema } from "../../lib/validation";
import { CODE_HOSTS, type CodeHost, type HostConnection, type LinkedRepository, type RemoteRepository, type SyncResult, type TicketPullRequest, type TicketPullRequests } from "../../lib/code-host-types";
import { providers } from "./providers";
import { fullNameSchema, validSignature, type RemotePullRequest } from "./providers/shared";
import { parsePullRequestUrl, ticketKeysIn } from "./refs";
import { accessToken, hostAvailable, isConnected } from "./tokens";

const HOSTS = Object.keys(CODE_HOSTS) as CodeHost[];
export const codeHostSchema = z.enum(["GITHUB", "BITBUCKET"]);
const linkRepositorySchema = z.object({ provider: codeHostSchema, fullName: fullNameSchema }).strict();
const linkPullRequestSchema = z.object({ url: z.string().trim().min(1).max(300) }).strict();

const repositoryInclude = { connectedBy: { select: { name: true } }, _count: { select: { pullRequests: true } } } satisfies Prisma.RepositoryInclude;
const pullRequestInclude = { repository: { select: { provider: true, fullName: true } } } satisfies Prisma.PullRequestInclude;

export const webhookUrl = (provider: CodeHost) =>
  `${new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").origin}/api/integrations/${provider.toLowerCase()}/webhook`;

const serializeRepository = (row: Prisma.RepositoryGetPayload<{ include: typeof repositoryInclude }>, admin: boolean): LinkedRepository => ({
  id: row.id, provider: row.provider, fullName: row.fullName, url: row.url, connectedBy: row.connectedBy?.name ?? null, pullRequestCount: row._count.pullRequests,
  // The secret lets someone forge deliveries, so only the admins who set the webhook up see it.
  webhook: admin ? { url: webhookUrl(row.provider), secret: row.webhookSecret } : null,
});
const serializePullRequest = (row: Prisma.PullRequestGetPayload<{ include: typeof pullRequestInclude }>): TicketPullRequest => ({
  id: row.id, number: row.number, title: row.title, url: row.url, status: row.status, branch: row.branch, author: row.author,
  updatedAt: row.updatedAt.toISOString(), repository: row.repository,
});

// A ticket the caller cannot open is reported as missing, so its existence is not revealed.
async function requireTicket(userId: string, ticketId: string, action: ProjectAction) {
  idSchema.parse(ticketId);
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { id: true, projectId: true } });
  const readable = ticket && await requireProject(userId, ticket.projectId, "ticket:read").catch(() => null);
  if (!ticket || !readable) throw new AppError(404, "Ticket not found.");
  if (action !== "ticket:read") await requireProject(userId, ticket.projectId, action);
  return ticket;
}

async function requireRepository(userId: string, repositoryId: string, action: ProjectAction) {
  idSchema.parse(repositoryId);
  const repository = await db.repository.findUnique({ where: { id: repositoryId }, include: { project: { select: { key: true } } } });
  const readable = repository && await requireProject(userId, repository.projectId, "project:read").catch(() => null);
  if (!repository || !readable) throw new AppError(404, "Repository not found.");
  if (action !== "project:read") await requireProject(userId, repository.projectId, action);
  return repository;
}

// Reads go through the sign-in of whoever linked the repository, so teammates need no code-host account of their own.
async function repositoryToken(repository: { provider: CodeHost; connectedById: string | null }) {
  const label = CODE_HOSTS[repository.provider].label;
  if (!repository.connectedById) throw new AppError(409, `The person who linked this repository has left. Unlink it and link it again to reconnect ${label}.`);
  return accessToken(repository.connectedById, repository.provider).catch(error => {
    if (error instanceof AppError && error.status === 409) throw new AppError(409, `The ${label} connection for this repository has expired. The person who linked it needs to connect ${label} again.`);
    throw error;
  });
}

// Attaches one pull request to the tickets it names (plus `alsoTicketId` for a pasted link) and refreshes every copy already attached.
async function record(repository: { id: string; projectId: string; project: { key: string } }, remote: RemotePullRequest, alsoTicketId?: string) {
  const keys = ticketKeysIn(`${remote.title} ${remote.branch}`, repository.project.key);
  const named = keys.length ? await db.ticket.findMany({ where: { projectId: repository.projectId, key: { in: keys } }, select: { id: true } }) : [];
  const ticketIds = [...new Set([...named.map(ticket => ticket.id), ...(alsoTicketId ? [alsoTicketId] : [])])];
  const data = {
    number: remote.number, title: remote.title.slice(0, 300), url: remote.url.slice(0, 500), status: remote.status,
    branch: remote.branch.slice(0, 250), author: remote.author?.slice(0, 100) ?? null, updatedAt: remote.updatedAt,
  };
  const { count } = await db.pullRequest.createMany({ data: ticketIds.map(ticketId => ({ ticketId, repositoryId: repository.id, ...data })), skipDuplicates: true });
  await db.pullRequest.updateMany({ where: { repositoryId: repository.id, number: remote.number }, data });
  return count;
}

export async function listConnections(userId: string): Promise<HostConnection[]> {
  return Promise.all(HOSTS.map(async provider => ({ provider, available: hostAvailable(provider), connected: await isConnected(userId, provider) })));
}

// The repositories the signed-in person can link, read with their own code-host sign-in.
export async function listRemoteRepositories(userId: string, provider: unknown): Promise<RemoteRepository[]> {
  const host = codeHostSchema.parse(provider);
  return providers[host].listRepositories(await accessToken(userId, host));
}

export async function listRepositories(userId: string, projectId: string): Promise<LinkedRepository[]> {
  const { role } = await requireProject(userId, projectId, "project:read");
  const rows = await db.repository.findMany({ where: { projectId }, include: repositoryInclude, orderBy: [{ fullName: "asc" }, { id: "asc" }] });
  return rows.map(row => serializeRepository(row, role === "ADMIN"));
}

export async function linkRepository(userId: string, projectId: string, input: unknown): Promise<LinkedRepository> {
  const { provider, fullName } = linkRepositorySchema.parse(input);
  await requireProject(userId, projectId, "project:manage");
  // Asking the host proves this person can read the repository, and gives its exact name and address.
  const remote = await providers[provider].getRepository(await accessToken(userId, provider), fullName);
  const row = await db.repository.create({
    data: { projectId, provider, fullName: remote.fullName, url: remote.url, connectedById: userId, webhookSecret: randomBytes(32).toString("hex") },
    include: repositoryInclude,
  });
  return serializeRepository(row, true);
}

// Unlinking also removes the repository's pull requests from tickets.
export async function unlinkRepository(userId: string, repositoryId: string) {
  const repository = await requireRepository(userId, repositoryId, "project:manage");
  await db.repository.delete({ where: { id: repository.id } });
  return { deleted: true };
}
