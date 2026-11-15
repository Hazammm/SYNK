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
