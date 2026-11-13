import { compare, hash } from "bcryptjs";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { rateLimit } from "../../lib/rate-limit";
import { realtime } from "../../lib/realtime";
import { requireWorkspace } from "../../lib/permissions";
import { idSchema, passwordChangeSchema, profileUpdateSchema } from "../../lib/validation";
import { revokeProjectAccess } from "../projects/service";
import type { Account } from "../../lib/account-types";

const PROVIDER_NAMES: Record<string, string> = { google: "Google", github: "GitHub", bitbucket: "Bitbucket" };

// Everything the settings page shows about the signed-in person.
export async function getAccount(userId: string, currentSessionId: string): Promise<Account> {
  const [user, otherSessions, memberships] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, createdAt: true, passwordHash: true, notifyAssigned: true, notifyComments: true, notifyMentions: true, accounts: { select: { provider: true } } },
    }),
    db.loginSession.count({ where: { userId, id: { not: currentSessionId }, expiresAt: { gt: new Date() } } }),
    db.membership.findMany({
      where: { userId }, orderBy: { createdAt: "asc" },
      select: { role: true, workspace: { select: { id: true, name: true, memberships: { select: { role: true } } } } },
    }),
  ]);
  return {
    id: user.id, name: user.name ?? "", email: user.email, createdAt: user.createdAt.toISOString(),
    hasPassword: Boolean(user.passwordHash),
    providers: [...new Set(user.accounts.map(account => PROVIDER_NAMES[account.provider] ?? account.provider))],
    notifications: { assigned: user.notifyAssigned, comments: user.notifyComments, mentions: user.notifyMentions },
    otherSessions,
    workspaces: memberships.map(({ role, workspace }) => ({
      id: workspace.id, name: workspace.name, role, memberCount: workspace.memberships.length,
      adminCount: workspace.memberships.filter(member => member.role === "ADMIN").length,
    })),
  };
}

export async function updateProfile(userId: string, input: unknown) {
  const { name, notifications } = profileUpdateSchema.parse(input);
  await db.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined && { name }),
      ...(notifications?.assigned !== undefined && { notifyAssigned: notifications.assigned }),
      ...(notifications?.comments !== undefined && { notifyComments: notifications.comments }),
      ...(notifications?.mentions !== undefined && { notifyMentions: notifications.mentions }),
    },
  });
  return { updated: true };
}

// Ends the other login sessions and drops their live chat connections. Returns how many were ended.
async function endOtherSessions(database: Pick<typeof db, "loginSession">, userId: string, keepSessionId: string) {
  const others = await database.loginSession.findMany({ where: { userId, id: { not: keepSessionId } }, select: { id: true } });
  await database.loginSession.deleteMany({ where: { userId, id: { in: others.map(session => session.id) } } });
  return others.map(session => session.id);
}
const disconnect = (sessionIds: string[]) => { const rt = realtime(); for (const id of sessionIds) rt?.disconnectSession(id); };

export async function signOutOtherSessions(userId: string, currentSessionId: string) {
  const ended = await endOtherSessions(db, userId, currentSessionId);
  disconnect(ended);
  return { signedOut: ended.length };
}

// Changing the password signs out every other device, so a stolen session cannot outlive it.
export async function changePassword(userId: string, currentSessionId: string, input: unknown) {
  const { currentPassword, newPassword } = passwordChangeSchema.parse(input);
  rateLimit(`password-change:${userId}`, 5, 15 * 60_000);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!user.passwordHash) throw new AppError(400, "This account signs in with Google, GitHub or Bitbucket and has no password to change.");
  if (!await compare(currentPassword, user.passwordHash)) throw new AppError(400, "Your current password is not correct.");
  if (currentPassword === newPassword) throw new AppError(400, "Choose a new password that is different from your current one.");
  const passwordHash = await hash(newPassword, 12);
  const ended = await db.$transaction(async tx => {
    // Lock the user first, like logins and password resets, so they cannot interleave.
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    // Someone else changed it while bcrypt was running: refuse rather than overwrite.
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (current.passwordHash !== user.passwordHash) throw new AppError(409, "Your password was just changed somewhere else. Reload and try again.");
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return endOtherSessions(tx, userId, currentSessionId);
  });
  disconnect(ended);
  return { signedOut: ended.length };
}

// Members can leave a workspace. An admin can leave only while another admin remains.
export async function leaveWorkspace(userId: string, workspaceId: string) {
  idSchema.parse(workspaceId);
  await db.$transaction(async tx => {
    const membership = await requireWorkspace(userId, workspaceId, "workspace:read", tx);
    // Locking the workspace means two admins leaving at once cannot leave it with none.
    await tx.$executeRaw`SELECT 1 FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
    if (membership.role === "ADMIN" && await tx.membership.count({ where: { workspaceId, role: "ADMIN" } }) <= 1) {
      throw new AppError(400, "You are the only admin of this workspace. Make someone else an admin before leaving.");
    }
    // Channel memberships go with the workspace membership.
    await tx.membership.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    const projects = await tx.project.findMany({ where: { workspaceId }, select: { id: true } });
    await revokeProjectAccess(tx, userId, projects.map(project => project.id));
  });
  realtime()?.revokeUser(userId);
  return { left: true };
}
