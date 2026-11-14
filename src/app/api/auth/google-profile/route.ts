/**
 * GET /api/auth/google-profile?token=<JWE>&next=<url>
 *
 * This tiny route exists because NextAuth v4's signIn callback can return a
 * redirect URL string, but cannot set response headers.  So for the unknown-
 * email Google path we redirect here first; this route validates the JWE token,
 * sets it as an httpOnly cookie, then redirects to the real destination.
 *
 * The token is an opaque encrypted blob (no PII in URL), valid for 10 minutes.
 */

import { NextResponse } from "next/server";
import { decryptGoogleProfile, googleProfileCookieHeader } from "@/lib/google-profile-cookie";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_NEXT = ["/create-workspace", "/join/pending"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get("token");
  const rawNext = searchParams.get("next") ?? "/create-workspace?from=google";

  // Rate-limit: 20 requests per IP per 10 minutes (brute-forcing the JWE is infeasible,
  // but limit anyway to avoid log spam / CPU burn).
  const ip = request.headers.get("x-synk-client-ip") ?? "unknown";
  try {
    rateLimit(`google-profile:${ip}`, 20, 10 * 60_000);
  } catch {
    return NextResponse.redirect(new URL("/login?error=rate_limit", request.url));
  }

  // Validate the `next` parameter strictly — only our own paths are allowed.
  const nextPath = (() => {
    try {
      const decoded = decodeURIComponent(rawNext);
      if (ALLOWED_NEXT.some(prefix => decoded.startsWith(prefix))) return decoded;
    } catch { /* ignore */ }
    return "/create-workspace?from=google";
  })();

  if (!rawToken) {
    return NextResponse.redirect(new URL("/login?error=google_expired", request.url));
  }

  // Validate the JWE before trusting it.
  const profile = rawToken ? await decryptGoogleProfile(rawToken) : null;
  if (!profile) {
    return NextResponse.redirect(new URL("/login?error=google_expired", request.url));
  }

  // Set httpOnly cookie and redirect to destination.
  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.headers.set("Set-Cookie", googleProfileCookieHeader(rawToken));
  return response;
}

