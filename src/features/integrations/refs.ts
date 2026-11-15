import type { CodeHost } from "../../lib/code-host-types";

// Ticket keys such as SYN-12 named in a pull request's title or branch, for one project key. Branch names are often lower case.
export function ticketKeysIn(text: string, projectKey: string): string[] {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${projectKey}-(\\d{1,9})(?![A-Za-z0-9])`, "gi");
  return [...new Set([...text.matchAll(pattern)].map(match => `${projectKey}-${Number(match[1])}`))];
}
