/**
 * Short-lived encrypted cookie that carries a verified Google profile from the
 * NextAuth signIn callback to /create-workspace (or /join/pending).
 *
 * Uses jose EncryptJWT (JWE, A128GCM / dir) so the payload is not visible to
 * the browser.  The cookie is httpOnly, sameSite=lax, secure in production.
 * TTL is 10 minutes.
 */

import { EncryptJWT, jwtDecrypt, errors as joseErrors } from "jose";
import { cookies } from "next/headers";

export const GOOGLE_PROFILE_COOKIE = "synk_google_pending";
const TTL_SECONDS = 10 * 60;

export interface GoogleProfile {
  email: string;
  name: string;
  image?: string;
  providerAccountId: string;
}

/** Derive a 128-bit key from the NEXTAUTH_SECRET.  Deterministic, never stored. */
async function cookieKey(): Promise<Uint8Array> {
  const secret = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
  const encoded = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey("raw", encoded, { name: "HKDF" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("synk-google-profile-cookie"), info: new Uint8Array() },
    keyMaterial,
    128,
  );
  return new Uint8Array(bits);
}

/** Encrypt a GoogleProfile into a JWE and return the token string. */
export async function encryptGoogleProfile(profile: GoogleProfile): Promise<string> {
  const key = await cookieKey();
  return new EncryptJWT({ profile })
    .setProtectedHeader({ alg: "dir", enc: "A128GCM" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .encrypt(key);
}

/** Decrypt and return the GoogleProfile, or null if missing / expired / tampered. */
export async function decryptGoogleProfile(token: string): Promise<GoogleProfile | null> {
  try {
    const key = await cookieKey();
    const { payload } = await jwtDecrypt(token, key);
    const profile = payload["profile"];
    if (!profile || typeof profile !== "object") return null;
    const p = profile as Record<string, unknown>;
    if (typeof p.email !== "string" || typeof p.name !== "string" || typeof p.providerAccountId !== "string") return null;
    return {
      email: p.email,
      name: p.name,
      image: typeof p.image === "string" ? p.image : undefined,
      providerAccountId: p.providerAccountId,
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired || err instanceof joseErrors.JOSEError) return null;
    throw err;
  }
}

/** Read the pending Google profile from the request cookie jar (server-side). */
export async function readGoogleProfileCookie(): Promise<GoogleProfile | null> {
  const jar = await cookies();
  const token = jar.get(GOOGLE_PROFILE_COOKIE)?.value;
  if (!token) return null;
  return decryptGoogleProfile(token);
}

/** Set the cookie as a Set-Cookie header string (called from a route handler). */
export function googleProfileCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GOOGLE_PROFILE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secure}`;
}

/** Clear the cookie (call after the Google workspace is successfully created). */
export function clearGoogleProfileCookieHeader(): string {
  return `${GOOGLE_PROFILE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

