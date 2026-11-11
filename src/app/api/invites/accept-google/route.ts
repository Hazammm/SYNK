/**
 * POST /api/invites/accept-google
 *
 * Accepts a pending workspace invite for a Google-authenticated user.
 * The Google profile is read from the short-lived httpOnly cookie set by
 * /api/auth/google-profile — no PII comes from the client body.
 *
 * In a single transaction:
 *   - Claim the invite (mark ACCEPTED)
 *   - Create User (emailVerified) + Account (google) if not already existing
 *   - Create Membership (MEMBER)
 *   - Grant READ access to existing projects
 *   - Set lastActiveWorkspaceId
 *
 * After this the client triggers signIn("google") which finds the user and
 * establishes the JWT session.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { readGoogleProfileCookie, clearGoogleProfileCookieHeader } from "@/lib/google-profile-cookie";
import { rateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail } from "@/lib/mailer";

const bodySchema = z.object({ inviteId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  const ip = request.headers.get("x-synk-client-ip") ?? "unknown";
  try {
    rateLimit(`accept-google:${ip}`, 10, 5 * 60_000);
  } catch {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }

  const profile = await readGoogleProfileCookie();
  if (!profile) {
    return NextResponse.json({ error: "Your Google sign-in expired. Please try again." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { inviteId } = parsed.data;

  try {
    const accepted = await db.$transaction(async tx => {
      // Load and claim the invite atomically.
      const invite = await tx.invite.findFirst({
        where: {
          id: inviteId,
          email: { equals: profile.email, mode: "insensitive" },
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true, workspaceId: true, workspace: { select: { name: true } } },
      });
      if (!invite) throw Object.assign(new Error("Invitation not found or expired."), { status: 410 });

      await tx.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } });

      // Create user if not already registered (guard against race).
      let userId: string;
      let isNewUser = false;
      const existing = await tx.user.findFirst({
        where: { email: { equals: profile.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        userId = existing.id;
      } else {
        const user = await tx.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            emailVerified: new Date(),
            image: profile.image ?? null,
          },
          select: { id: true },
        });
        userId = user.id;
        isNewUser = true;
      }

      // Link Google Account (upsert — may already be linked if the user existed).
      await tx.account.upsert({
        where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.providerAccountId } },
        create: { userId, type: "oauth", provider: "google", providerAccountId: profile.providerAccountId },
        update: { userId },
      });

      // Grant membership.
      await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        create: { workspaceId: invite.workspaceId, userId, role: "MEMBER" },
        update: {},
      });

      // Grant READ access to all existing projects in the workspace.
      const projects = await tx.project.findMany({ where: { workspaceId: invite.workspaceId }, select: { id: true } });
      if (projects.length) {
        await tx.projectAccess.createMany({
          data: projects.map(p => ({ projectId: p.id, userId, level: "READ" as const })),
          skipDuplicates: true,
        });
      }

      // Remember this workspace as the active one.
      await tx.user.update({ where: { id: userId }, data: { lastActiveWorkspaceId: invite.workspaceId } });
      return {
        welcomeEmail: isNewUser
          ? {
              email: profile.email,
              name: profile.name,
              workspaceId: invite.workspaceId,
              workspaceName: invite.workspace.name,
            }
          : null,
      };
    });

    let welcomeEmailFailed = false;
    if (accepted.welcomeEmail) {
      try {
        await sendWelcomeEmail(accepted.welcomeEmail);
      } catch {
        welcomeEmailFailed = true;
      }
    }

    // Clear the pending cookie — the Google sign-in that follows will establish the session.
    const res = NextResponse.json({ ok: true, welcomeEmailFailed });
    res.headers.set("Set-Cookie", clearGoogleProfileCookieHeader());
    return res;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "You are already a member of this workspace." }, { status: 409 });
    }
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status });
  }
}
