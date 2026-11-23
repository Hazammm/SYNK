import { AppError } from "./errors";

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeEmailDomain(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function isValidEmailDomain(value: string) {
  return DOMAIN.test(normalizeEmailDomain(value));
}

export function parseEmailDomains(input: unknown): string[] {
  if (!Array.isArray(input)) throw new AppError(400, "Enter allowed email domains as a list.");
  const domains = [...new Set(input.map(item => {
    if (typeof item !== "string") throw new AppError(400, "Each domain must be text.");
    return normalizeEmailDomain(item);
  }).filter(Boolean))];
  if (domains.length > 20) throw new AppError(400, "You can allow up to 20 email domains.");
  for (const domain of domains) {
    if (!isValidEmailDomain(domain)) throw new AppError(400, `“${domain}” is not a valid email domain.`);
  }
  return domains;
}

export function emailMatchesDomains(email: string, domains: string[]) {
  if (!domains.length) return true;
  const host = email.trim().toLowerCase().split("@")[1] ?? "";
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

export function assertEmailAllowed(email: string, domains: string[]) {
  if (!emailMatchesDomains(email, domains)) {
    throw new AppError(403, domains.length === 1
      ? `This workspace only allows people with @${domains[0]} email addresses.`
      : "This workspace only allows people whose email domain is on the allowed list.");
  }
}
