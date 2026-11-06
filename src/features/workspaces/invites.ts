import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createInviteToken, hashInviteToken } from "@/lib/invite-token";
import { assertMailerConfigured, sendWorkspaceInvite } from "@/lib/mailer";
import { inviteEmailsSchema, inviteTokenSchema, acceptInviteSchema } from "@/lib/validation";
import { requireWorkspace } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

async function expireInvite(tokenHash: string) {
  await db.invite.updateMany({
    where: { tokenHash, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
}

async function deliverInvites(invites: Array<{ email: string; token: string; adminName: string; workspaceName: string }>) {
  const results = await Promise.allSettled(invites.map(invite => sendWorkspaceInvite(invite)));
  const failedEmails = results.flatMap((result, index) => result.status === "rejected" ? [invites[index].email] : []);
  return { sent: results.length - failedEmails.length, failedEmails };
}

export async function createInvites(actorId: string, workspaceId: string, input: unknown) {
  const { emails } = inviteEmailsSchema.parse(input);
  const member = await requireWorkspace(actorId, workspaceId, "workspace:manage");
  assertMailerConfigured();
  const [workspace, inviter] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { id: true, name: true } }),
    db.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } }),
  ]);
  const invites = await db.$transaction(async tx => {
    const [existingMembers, pendingInvites] = await Promise.all([
      tx.membership.findMany({
        where: { workspaceId, user: { email: { in: emails, mode: "insensitive" } } },
        select: { user: { select: { email: true } } },
      }),
      tx.invite.findMany({
        where: { workspaceId, email: { in: emails, mode: "insensitive" }, status: "PENDING", expiresAt: { gt: new Date() } },
        select: { email: true },
      }),
    ]);
    if (existingMembers.length || pendingInvites.length) {
      throw new AppError(409, "One or more addresses are already members or have a pending invitation.");
    }
    return Promise.all(emails.map(async email => {
      const token = createInviteToken();
      await tx.invite.create({
        data: {
          workspaceId,
          email,
          role: "MEMBER",
          tokenHash: hashInviteToken(token),
          expiresAt: new Date(Date.now() + inviteLifetimeMs),
          invitedById: actorId,
        },
      });
      return { email, token, adminName: inviter.name ?? "Your workspace admin", workspaceName: workspace.name };
    }));
  });
  return { invites: invites.length, emailDelivery: await deliverInvites(invites), workspaceId: member.workspaceId };
}

export async function listInvites(actorId: string, workspaceId: string) {
  await requireWorkspace(actorId, workspaceId, "workspace:manage");
  const now = new Date();
  await db.invite.updateMany({
    where: { workspaceId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return db.invite.findMany({
    where: { workspaceId, status: "PENDING" },
    select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function resendInvite(actorId: string, workspaceId: string, inviteId: string) {
  await requireWorkspace(actorId, workspaceId, "workspace:manage");
  assertMailerConfigured();
  const invitation = await db.$transaction(async tx => {
    const invite = await tx.invite.findFirst({
      where: { id: inviteId, workspaceId, status: { in: ["PENDING", "EXPIRED"] } },
      include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!invite) throw new AppError(404, "Pending invitation not found.");
    const token = createInviteToken();
    await tx.invite.update({
      where: { id: invite.id },
      data: { tokenHash: hashInviteToken(token), status: "PENDING", expiresAt: new Date(Date.now() + inviteLifetimeMs) },
    });
    return {
      email: invite.email,
      token,
      adminName: invite.invitedBy.name ?? "Your workspace admin",
      workspaceName: invite.workspace.name,
    };
  });
  try {
    await sendWorkspaceInvite(invitation);
    return { sent: true };
  } catch {
    return { sent: false, message: "The invitation is pending, but the email could not be delivered. Try resending." };
  }
}

export async function revokeInvite(actorId: string, workspaceId: string, inviteId: string) {
  await requireWorkspace(actorId, workspaceId, "workspace:manage");
  const result = await db.invite.updateMany({
    where: { id: inviteId, workspaceId, status: { in: ["PENDING", "EXPIRED"] } },
    data: { status: "REVOKED" },
  });
  if (!result.count) throw new AppError(404, "Pending invitation not found.");
  return { revoked: true };
}

export async function validateInvite(input: unknown, clientIp = "unknown") {
  rateLimit(`invite-validation:${clientIp}`, 30, 15 * 60_000);
  const token = inviteTokenSchema.parse(input);
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  await expireInvite(tokenHash);
  const invite = await db.invite.findUnique({
    where: { tokenHash },
    select: {
      email: true,
      status: true,
      expiresAt: true,
      workspace: { select: { name: true } },
    },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= now) return { valid: false as const };
  const existingUser = await db.user.findFirst({
    where: { email: { equals: invite.email, mode: "insensitive" } },
    select: { id: true },
  });
  return {
    valid: true as const,
    workspaceName: invite.workspace.name,
    email: invite.email,
    requiresSignIn: !!existingUser,
  };
}

async function claimPendingInvite(tx: Prisma.TransactionClient, tokenHash: string) {
  const claim = await tx.invite.updateMany({
    where: { tokenHash, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "ACCEPTED" },
  });
  if (claim.count !== 1) throw new AppError(410, "This invite is no longer valid. Ask your admin for a new one.");
  return tx.invite.findUniqueOrThrow({
    where: { tokenHash },
    select: { id: true, email: true, workspaceId: true, workspace: { select: { id: true, name: true } } },
  });
}

async function grantProjectReadAccess(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
  const projects = await tx.project.findMany({ where: { workspaceId }, select: { id: true } });
  if (projects.length) {
    await tx.projectAccess.createMany({
      data: projects.map(project => ({ projectId: project.id, userId, level: "READ" as const })),
      skipDuplicates: true,
    });
  }
}

export async function acceptInvite(inputToken: unknown, input: unknown) {
  const token = inviteTokenSchema.parse(inputToken);
  const { name, password } = acceptInviteSchema.parse(input);
  const tokenHash = hashInviteToken(token);
  await expireInvite(tokenHash);
  const passwordHash = await hash(password, 12);
  try {
    return await db.$transaction(async tx => {
      const invitation = await claimPendingInvite(tx, tokenHash);
      if (await tx.user.findFirst({
        where: { email: { equals: invitation.email, mode: "insensitive" } },
        select: { id: true },
      })) {
        throw new AppError(409, "This email already has an account. Sign in to join.");
      }
      const user = await tx.user.create({
        data: { name, email: invitation.email, passwordHash },
        select: { id: true, name: true, email: true },
      });
      await tx.membership.create({
        data: { userId: user.id, workspaceId: invitation.workspaceId, role: "MEMBER" },
      });
      await grantProjectReadAccess(tx, invitation.workspaceId, user.id);
      return { user, workspace: invitation.workspace };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "This invitation could not be accepted. Sign in to join.");
    }
    throw error;
  }
}

export async function acceptInviteForExistingUser(inputToken: unknown, userId: string) {
  const token = inviteTokenSchema.parse(inputToken);
  const tokenHash = hashInviteToken(token);
  await expireInvite(tokenHash);
  return db.$transaction(async tx => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    const invitation = await claimPendingInvite(tx, tokenHash);
    if (!user.email || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new AppError(403, "Sign in with the email address that received this invitation.");
    }
    await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      create: { workspaceId: invitation.workspaceId, userId, role: "MEMBER" },
      update: {},
    });
    await grantProjectReadAccess(tx, invitation.workspaceId, userId);
    return { user, workspace: invitation.workspace };
  });
}
