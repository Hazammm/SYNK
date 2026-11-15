import type { CodeHost } from "../../lib/code-host-types";

// Ticket keys such as SYN-12 named in a pull request's title or branch, for one project key. Branch names are often lower case.
export function ticketKeysIn(text: string, projectKey: string): string[] {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${projectKey}-(\\d{1,9})(?![A-Za-z0-9])`, "gi");
  return [...new Set([...text.matchAll(pattern)].map(match => `${projectKey}-${Number(match[1])}`))];
}

// https://github.com/owner/repo/pull/12 or https://bitbucket.org/workspace/repo/pull-requests/12
export function parsePullRequestUrl(input: string): { provider: CodeHost; fullName: string; number: number } | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  const [owner, repo, kind, number] = url.pathname.split("/").filter(Boolean);
  const provider = url.hostname === "github.com" && kind === "pull" ? "GITHUB"
    : url.hostname === "bitbucket.org" && kind === "pull-requests" ? "BITBUCKET" : null;
  if (url.protocol !== "https:" || !provider || !owner || !repo || !/^\d{1,9}$/.test(number ?? "")) return null;
  return { provider, fullName: `${owner}/${repo}`, number: Number(number) };
}
