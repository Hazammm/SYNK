import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { db } from "./db";

/** Must match `maxAge` in auth.ts so Google onboarding sessions last as long as password logins. */
const maxAge = 7 * 24 * 60 * 60;

/** Create a login row and set the NextAuth JWT cookie so the browser is signed in without another OAuth round-trip. */
export async function issueSessionCookie(userId: string) {
  const login = await db.loginSession.create({
    data: { userId, expiresAt: new Date(Date.now() + maxAge * 1000) },
  });
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set.");
  const sessionToken = await encode({
    token: { sub: userId, sessionId: login.id },
    secret,
    maxAge,
  });
  const secure = Boolean(process.env.NEXTAUTH_URL?.startsWith("https://"));
  (await cookies()).set(secure ? "__Secure-next-auth.session-token" : "next-auth.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure,
  });
}
