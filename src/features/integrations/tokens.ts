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
// Bitbucket's connect asks for repository and pullrequest; the consumer must allow both, so a token is enough there.
const canReadRepositories = (provider: CodeHost, account: StoredAccount | null) =>
  Boolean(account?.access_token) && (provider !== "GITHUB" || (account!.scope ?? "").split(/[\s,]+/).includes("repo"));

const accountOf = (userId: string, provider: CodeHost) =>
  db.account.findFirst({ where: { userId, provider: CODE_HOSTS[provider].signInId }, select: fields });

export async function isConnected(userId: string, provider: CodeHost) {
  return canReadRepositories(provider, await accountOf(userId, provider));
}

// Bitbucket access tokens last two hours; the refresh token gets a new one.
async function refreshBitbucket(account: StoredAccount) {
  const response = await fetch("https://bitbucket.org/site/oauth2/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.BITBUCKET_ID}:${process.env.BITBUCKET_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refresh_token! }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const tokens = response?.ok ? await response.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number } | null : null;
  if (!tokens?.access_token) throw new AppError(409, "The Bitbucket sign-in has expired. Connect Bitbucket again.");
  await db.account.update({
    where: { id: account.id },
    data: { access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? account.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 7200) },
  });
  return tokens.access_token;
}

// The token Synk uses to read a code host on this person's behalf.
export async function accessToken(userId: string, provider: CodeHost): Promise<string> {
  const account = await accountOf(userId, provider);
  if (!account || !canReadRepositories(provider, account)) throw new AppError(409, `Connect ${CODE_HOSTS[provider].label} first.`);
  const expired = account.expires_at !== null && account.expires_at * 1000 < Date.now() + 60_000;
  return provider === "BITBUCKET" && expired && account.refresh_token ? refreshBitbucket(account) : account.access_token!;
}
