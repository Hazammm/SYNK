import { AppError } from "./errors";

const globalLimits = globalThis as unknown as { synkLimits?: Map<string, { count: number; expires: number }> };
const limits = globalLimits.synkLimits ??= new Map();

// Single-node limiter. A shared store is required before horizontally scaling.
export function rateLimit(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  if (limits.size > 10_000) {
    for (const [key, value] of limits) if (value.expires <= now) limits.delete(key);
    if (limits.size > 10_000) throw new AppError(429, "Please try again later.");
  }
  const entry = limits.get(key);
  if (!entry || entry.expires <= now) { limits.set(key, { count: 1, expires: now + windowMs }); return; }
  if (entry.count >= max) throw new AppError(429, "Too many requests. Please try again later.");
  entry.count++;
}
