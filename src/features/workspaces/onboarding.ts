import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createInviteToken, hashInviteToken } from "@/lib/invite-token";
import { assertMailerConfigured, sendWelcomeEmail, sendWorkspaceInvite } from "@/lib/mailer";
import { createWorkspaceSchema, createWorkspaceGoogleSchema } from "@/lib/validation";
import type { GoogleProfile } from "@/lib/google-profile-cookie";

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export async function createWorkspaceForAdmin(input: unknown) {
  const data = createWorkspaceSchema.parse(input);
  if (data.inviteEmails.length) assertMailerConfigured();
  const passwordHash = await hash(data.password, 12);

  let created: {
    user: { id: string; name: string | null; email: string | null };
    workspace: { id: string; name: string };
    invites: Array<{ email: string; token: string }>;
  };
  try {
    created = await db.$transaction(async tx => {
      const existingUser = await tx.user.findFirst({
        where: { email: { equals: data.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existingUser) throw new AppError(409, "Unable to create the workspace. Check the details or sign in.");
      const user = await tx.user.create({
        data: { name: data.adminName, email: data.email, passwordHash },
        select: { id: true, name: true, email: true },
      });
      const workspace = await tx.workspace.create({
        data: { name: data.workspaceName, createdById: user.id },
        select: { id: true, name: true },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastActiveWorkspaceId: workspace.id },
      });
      await tx.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "ADMIN" } });
      const project = await tx.project.create({
        data: { workspaceId: workspace.id, name: data.projectName },
        select: { id: true },
      });
      await tx.projectAccess.create({ data: { projectId: project.id, userId: user.id, level: "WRITE" } });
      const channel = await tx.channel.create({
        data: {
          workspaceId: workspace.id,
          createdById: user.id,
          name: "general",
          description: "Updates and conversations for everyone.",
        },
        select: { id: true },
      });
      await tx.channelMember.create({ data: { channelId: channel.id, workspaceId: workspace.id, userId: user.id } });

      const invites = await Promise.all(data.inviteEmails.map(async email => {
        const token = createInviteToken();
        await tx.invite.create({
          data: {
            workspaceId: workspace.id,
            email,
            tokenHash: hashInviteToken(token),
            expiresAt: new Date(Date.now() + inviteLifetimeMs),
            invitedById: user.id,
          },
        });
        return { email, token };
      }));
      return { user, workspace, invites };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Unable to create the workspace. Check the details or sign in.");
    }
    throw error;
  }

  const [welcomeDelivery, ...deliveries] = await Promise.allSettled([
    Promise.resolve().then(() => {
      if (!created.user.email) throw new Error("New workspace owner has no email address.");
      return sendWelcomeEmail({
        email: created.user.email,
        name: created.user.name ?? data.adminName,
        workspaceId: created.workspace.id,
        workspaceName: created.workspace.name,
      });
    }),
    ...created.invites.map(invite => sendWorkspaceInvite({
      adminName: created.user.name ?? data.adminName,
      workspaceName: created.workspace.name,
      ...invite,
    })),
  ]);
  const failedEmails = deliveries.flatMap((result, index) => result.status === "rejected" ? [created.invites[index].email] : []);
  return {
    user: created.user,
    workspace: created.workspace,
    emailDelivery: { sent: deliveries.length - failedEmails.length, failedEmails },
    welcomeEmailFailed: welcomeDelivery.status === "rejected",
  };
}

/**
 * Create a workspace for a user who signed up via Google OAuth.
 * The Google profile comes from the short-lived encrypted cookie; it has already
 * been verified by the signIn checkpoint (email_verified === true).
 *
 * Everything runs in ONE transaction:
 *   User (emailVerified) → Account (google) → Workspace → Membership → Project → Channel
 */
export async function createWorkspaceForGoogleUser(googleProfile: GoogleProfile, input: unknown) {
  const data = createWorkspaceGoogleSchema.parse(input);
  if (data.inviteEmails.length) assertMailerConfigured();

  let created: {
    user: { id: string; name: string | null; email: string | null };
    workspace: { id: string; name: string };
    invites: Array<{ email: string; token: string }>;
  };

  try {
    created = await db.$transaction(async tx => {
      // Guard: reject if the email is already registered (race condition / double-submit).
      const existingUser = await tx.user.findFirst({
        where: { email: { equals: googleProfile.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existingUser) throw new AppError(409, "An account with this email already exists. Please sign in.");

      // Create user with emailVerified set (Google has already verified it).
      const user = await tx.user.create({
        data: {
          name: googleProfile.name,
          email: googleProfile.email,
          emailVerified: new Date(),
          image: googleProfile.image ?? null,
        },
        select: { id: true, name: true, email: true },
      });

      // Create the Google Account link (what PrismaAdapter would do, but we do it manually
      // because we bypassed the adapter for unknown emails).
      await tx.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleProfile.providerAccountId,
        },
      });

      const workspace = await tx.workspace.create({
        data: { name: data.workspaceName, createdById: user.id },
        select: { id: true, name: true },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { lastActiveWorkspaceId: workspace.id },
      });

      await tx.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "ADMIN" } });

      const project = await tx.project.create({
        data: { workspaceId: workspace.id, name: data.projectName },
        select: { id: true },
      });
      await tx.projectAccess.create({ data: { projectId: project.id, userId: user.id, level: "WRITE" } });

      const channel = await tx.channel.create({
        data: {
          workspaceId: workspace.id,
          createdById: user.id,
          name: "general",
          description: "Updates and conversations for everyone.",
        },
        select: { id: true },
      });
      await tx.channelMember.create({ data: { channelId: channel.id, workspaceId: workspace.id, userId: user.id } });

      const invites = await Promise.all(data.inviteEmails.map(async email => {
        const token = createInviteToken();
        await tx.invite.create({
          data: {
            workspaceId: workspace.id,
            email,
            tokenHash: hashInviteToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            invitedById: user.id,
          },
        });
        return { email, token };
      }));

      return { user, workspace, invites };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "An account with this email already exists. Please sign in.");
    }
    throw error;
  }

  const [welcomeDelivery, ...deliveries] = await Promise.allSettled([
    Promise.resolve().then(() => {
      if (!created.user.email) throw new Error("New workspace owner has no email address.");
      return sendWelcomeEmail({
        email: created.user.email,
        name: created.user.name ?? googleProfile.name,
        workspaceId: created.workspace.id,
        workspaceName: created.workspace.name,
      });
    }),
    ...created.invites.map(invite => sendWorkspaceInvite({
      adminName: created.user.name ?? googleProfile.name,
      workspaceName: created.workspace.name,
      ...invite,
    })),
  ]);
  const failedEmails = deliveries.flatMap((result, index) => result.status === "rejected" ? [created.invites[index].email] : []);
  return {
    user: created.user,
    workspace: created.workspace,
    emailDelivery: { sent: deliveries.length - failedEmails.length, failedEmails },
    welcomeEmailFailed: welcomeDelivery.status === "rejected",
  };
}
