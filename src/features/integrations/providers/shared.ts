import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../../lib/errors";
import type { PullRequestStatus, RemoteRepository } from "../../../lib/code-host-types";

export type RemotePullRequest = { number: number; title: string; url: string; status: PullRequestStatus; branch: string; author: string | null; updatedAt: Date };
export type WebhookEvent = { fullName: string; pullRequest: RemotePullRequest };

// What Synk needs from a code host. GitHub and Bitbucket each implement it.
export type Provider = {
  label: string;
  // The request header that carries "sha256=<hmac of the raw body>".
  signatureHeader: string;
  listRepositories(token: string): Promise<RemoteRepository[]>;
  getRepository(token: string, fullName: string): Promise<RemoteRepository>;
  listPullRequests(token: string, fullName: string): Promise<RemotePullRequest[]>;
  getPullRequest(token: string, fullName: string, number: number): Promise<RemotePullRequest>;
  // Null for deliveries that are not about a pull request, such as GitHub's ping.
  parseWebhook(headers: Headers, body: unknown): WebhookEvent | null;
};

// "owner/name" goes into API paths, so only the characters both hosts allow are accepted.
export const fullNameSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "Use the form owner/repository.")
  .refine(value => !value.split("/").some(part => part === "." || part === ".."), "Use the form owner/repository.");

// One authenticated GET. Failures become messages a person can act on; the host's own reply is never passed on.
export async function hostGet<T>(label: string, url: string, token: string, schema: z.ZodType<T>, headers: Record<string, string> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(10_000) });
  } catch { throw new AppError(502, `${label} could not be reached. Try again in a moment.`); }
  if (response.status === 401) throw new AppError(409, `Your ${label} sign-in has expired. Connect ${label} again.`);
  if (response.status === 403 || response.status === 404) throw new AppError(404, `Not found on ${label}, or your ${label} account can't open it.`);
  if (!response.ok) throw new AppError(502, `${label} returned an error (${response.status}). Try again in a moment.`);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new AppError(502, `${label} sent a reply Synk could not read.`);
  return parsed.data;
}

export function validSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
