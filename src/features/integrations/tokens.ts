import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { CODE_HOSTS, type CodeHost } from "../../lib/code-host-types";

type StoredAccount = { id: string; access_token: string | null; refresh_token: string | null; expires_at: number | null; scope: string | null };
const fields = { id: true, access_token: true, refresh_token: true, expires_at: true, scope: true } as const;

// The sign-in apps double as the code-host connection, so a host is offered only when its app is configured.
export const hostAvailable = (provider: CodeHost) => provider === "GITHUB"
  ? Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET)
  : Boolean(process.env.BITBUCKET_ID && process.env.BITBUCKET_SECRET);

// GitHub only grants repository access when the sign-in asked for the "repo" scope.
// Bitbucket's scopes are fixed on the OAuth consumer, so a token is enough there.
const canReadRepositories = (provider: CodeHost, account: StoredAccount | null) =>
  Boolean(account?.access_token) && (provider !== "GITHUB" || (account!.scope ?? "").split(/[\s,]+/).includes("repo"));

const accountOf = (userId: string, provider: CodeHost) =>
  db.account.findFirst({ where: { userId, provider: CODE_HOSTS[provider].signInId }, select: fields });

export async function isConnected(userId: string, provider: CodeHost) {
  return canReadRepositories(provider, await accountOf(userId, provider));
}
