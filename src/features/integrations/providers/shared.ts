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
