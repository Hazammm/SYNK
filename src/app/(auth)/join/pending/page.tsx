/**
 * /join/pending — shown to a Google user whose email matches one or more pending invites.
 *
 * The Google profile was stored in an encrypted httpOnly cookie by /api/auth/google-profile.
 * This page reads it server-side, looks up pending invites, and lets the user accept one.
 * Accepting an invite creates the user account, links the Google Account, sets membership,
 * then signs the user in via the Google flow so the JWT is established.
 */

import { redirect } from "next/navigation";
import { readGoogleProfileCookie } from "@/lib/google-profile-cookie";
import { db } from "@/lib/db";
import PendingInviteClient from "./PendingInviteClient";

export default async function JoinPendingPage() {
  const profile = await readGoogleProfileCookie();
  if (!profile) {
    // Cookie missing or expired — restart.
    redirect("/login?error=google_expired");
  }

  // Find all pending, unexpired invites for this verified email.
  const invites = await db.invite.findMany({
    where: {
      email: { equals: profile.email, mode: "insensitive" },
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      workspace: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!invites.length) {
    // No pending invites — send to workspace creation instead.
    redirect("/create-workspace?from=google");
  }

  return (
    <PendingInviteClient
      email={profile.email}
      name={profile.name}
      invites={invites.map(inv => ({
        id: inv.id,
        expiresAt: inv.expiresAt.toISOString(),
        workspace: inv.workspace,
      }))}
    />
  );
}

