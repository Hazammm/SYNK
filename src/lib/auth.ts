import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { db } from "./db";
import { credentialsSchema } from "./validation";
import { rateLimit } from "./rate-limit";
import { realtime } from "./realtime";
import { encryptGoogleProfile } from "./google-profile-cookie";

const maxAge = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 5 * 60_000;

/**
 * Limits password guesses per client, so one client can't lock an account for
 * everyone else. The much higher per-account limit slows guessing spread across
 * many addresses, and is checked second so blocked clients don't count towards it.
 */
export function limitLogin(email: string, clientIp: string) {
  rateLimit(`login:${clientIp}:${email}`, 10, LOGIN_WINDOW_MS);
  rateLimit(`login:${email}`, 100, LOGIN_WINDOW_MS);
}

/**
 * Creates the login record for a verified password, unless that password was
 * replaced during the slow bcrypt check. The shared row lock orders this against
 * a reset: either the reset sees this login and revokes it, or this sees the new
 * hash and refuses.
 */
export async function createPasswordLogin(userId: string, verifiedHash: string) {
  return db.$transaction(async tx => {
    const [current] = await tx.$queryRaw<{ passwordHash: string | null }[]>`SELECT "passwordHash" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
    if (current?.passwordHash !== verifiedHash) return null;
    const login = await tx.loginSession.create({ data: { userId, expiresAt: new Date(Date.now() + maxAge * 1000) } });
    return login.id;
  });
}

const providers: NextAuthOptions["providers"] = [Credentials({
  name: "Email and password",
  credentials: { email: { type: "email" }, password: { type: "password" } },
  async authorize(input, request) {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return null;
    limitLogin(parsed.data.email, request?.headers?.["x-synk-client-ip"] ?? "unknown");
    const user = await db.user.findFirst({
      where: { email: { equals: parsed.data.email, mode: "insensitive" } },
      select: { id: true, name: true, email: true, image: true, passwordHash: true },
    });
    // Use the same bcrypt cost for unknown accounts to avoid an easy timing oracle.
    const fallback = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5MR.PmTuYkSY7jLRPx3QIkggY7UjN0i";
    const valid = await compare(parsed.data.password, user?.passwordHash ?? fallback);
    // Reject if password invalid OR if user has no password (Google-only account).
    if (!valid || !user?.passwordHash || !user.email) return null;
    const loginSessionId = await createPasswordLogin(user.id, user.passwordHash);
    if (!loginSessionId) return null;
    return { id: user.id, name: user.name, email: user.email, image: user.image, loginSessionId };
  },
})];

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in.");
}

if (googleClientId && googleClientSecret) {
  providers.push(Google({
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    allowDangerousEmailAccountLinking: true,
  }));
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    /**
     * Google OAuth checkpoint:
     *   - Reject unverified emails.
     *   - Existing user (email already in DB): allow, PrismaAdapter will link the Account.
     *   - New user: do NOT create a user. Check for pending invites; redirect accordingly.
     *     The encrypted profile is stored in a short-lived httpOnly cookie so the
     *     create-workspace page can prefill fields safely without exposing PII in the URL.
     */
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        // Reject unverified Google email.
        // Google's profile extends the base Profile with email_verified: boolean.
        const gp = profile as (typeof profile & { email_verified?: boolean }) | undefined;
        if (!gp?.email_verified || !gp.email) return false;
        const email = gp.email.toLowerCase();

        const existing = await db.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        });

        if (existing) {
          // Known user — PrismaAdapter links the Account; normal JWT resolution applies.
          return true;
        }

        // Unknown email — block adapter user creation by returning a redirect URL.
        // Store the Google profile in an encrypted cookie so the destination page can use it.
        const token = await encryptGoogleProfile({
          email,
          name: (gp.name ?? "").trim() || email.split("@")[0],
          image: typeof gp.image === "string" ? gp.image : undefined,
          providerAccountId: account.providerAccountId,
        });

        // Check for pending invites for this verified email.
        const invite = await db.invite.findFirst({
          where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
          select: { id: true },
        });

        // We can't set response headers from signIn callback directly, so we pass the
        // JWE token in a URL-safe query param that the destination route handler reads
        // and immediately converts to an httpOnly cookie.  The token itself is an
        // opaque encrypted blob — no PII is in the URL.
        const dest = invite ? "/join/pending" : "/create-workspace?from=google";
        return `/api/auth/google-profile?token=${encodeURIComponent(token)}&next=${encodeURIComponent(dest)}`;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        // Password logins already created theirs in authorize; OAuth logins haven't.
        token.sessionId = user.loginSessionId ?? (await db.loginSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + maxAge * 1000) } })).id;
        token.sub = user.id;
      }
      if (token.sub) {
        const userRecord = await db.user.findUnique({
          where: { id: token.sub },
          select: { lastActiveWorkspaceId: true },
        });
        let membership = userRecord?.lastActiveWorkspaceId
          ? await db.membership.findUnique({
              where: { workspaceId_userId: { workspaceId: userRecord.lastActiveWorkspaceId, userId: token.sub } },
              select: { workspaceId: true, role: true },
            })
          : null;
        if (!membership) {
          membership = await db.membership.findFirst({
            where: { userId: token.sub },
            orderBy: { createdAt: "asc" },
            select: { workspaceId: true, role: true },
          });
        }
        token.workspaceId = membership?.workspaceId;
        token.role = membership?.role;
      }
      return token;
    },
    async session({ session, token }) {
      const login = token.sessionId
        ? await db.loginSession.findUnique({
            where: { id: token.sessionId },
            include: { user: { select: { name: true, email: true } } },
          })
        : null;
      const active = login && login.userId === token.sub && login.expiresAt > new Date();
      session.user.id = active ? login.userId : "";
      session.user.workspaceId = active ? token.workspaceId ?? "" : "";
      session.user.role = active ? token.role ?? null : null;
      if (active) {
        session.user.name = login.user.name;
        session.user.email = login.user.email;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.sessionId) {
        await db.loginSession.deleteMany({ where: { id: token.sessionId } });
        realtime()?.disconnectSession(token.sessionId);
      }
    },
  },
};
