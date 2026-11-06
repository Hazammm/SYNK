const normalize = (address: string) => address.trim().replace(/^::ffff:/i, "");

/** Parses the comma-separated TRUSTED_PROXY_IPS setting. */
export function parseTrustedProxies(value = "") {
  return new Set(value.split(",").map(normalize).filter(Boolean));
}

/**
 * Resolves the address to rate-limit a request by.
 *
 * X-Forwarded-For is only honoured when the connection itself comes from a
 * trusted proxy, otherwise anyone reaching the port directly could forge it.
 * The header is then read from the right, skipping our own proxies: entries to
 * the left of the first unknown address are client-controlled.
 */
export function resolveClientIp(socketAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedProxies: ReadonlySet<string>) {
  if (!socketAddress) return "unknown";
  const direct = normalize(socketAddress);
  if (!trustedProxies.has(direct)) return direct;
  const chain = [forwardedFor ?? []].flat().join(",").split(",").map(normalize).filter(Boolean);
  return chain.findLast(address => !trustedProxies.has(address)) ?? direct;
}
