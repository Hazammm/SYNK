/**
 * Resolves the address to rate-limit a request by.
 *
 * X-Forwarded-For is client-controlled except for the entries our own proxies
 * appended, so it is read from the right: with N trusted proxies, the client is
 * the Nth entry from the end. With no trusted proxies the header is ignored.
 */
export function resolveClientIp(socketAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedProxyHops: number) {
  const direct = socketAddress ?? "unknown";
  if (trustedProxyHops <= 0 || !forwardedFor) return direct;
  const chain = [forwardedFor].flat().join(",").split(",").map(entry => entry.trim()).filter(Boolean);
  return chain[chain.length - trustedProxyHops] ?? direct;
}
