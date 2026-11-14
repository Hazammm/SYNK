import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createInviteToken, hashInviteToken } from "@/lib/invite-token";
import { assertMailerConfigured, sendWelcomeEmail, sendWorkspaceInvite } from "@/lib/mailer";
import { createWorkspaceSchema, createWorkspaceGoogleSchema } from "@/lib/validation";
import type { GoogleProfile } from "@/lib/google-profile-cookie";
import { createBoardRecord } from "../projects/service";

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const mailWaitMs = 2_000;

async function settleOnboardingMail(
  sendWelcome: () => Promise<unknown>,
  invites: Array<{ email: string; send: () => Promise<unknown> }>,
) {
  const work = Promise.allSettled([sendWelcome(), ...invites.map(invite => invite.send())]);
  const outcome = await Promise.race([
    work.then(results => ({ timedOut: false as const, results })),
    new Promise<{ timedOut: true }>(resolve => setTimeout(() => resolve({ timedOut: true }), mailWaitMs)),
  ]);
  if (outcome.timedOut) {
    void work;
    return { emailDelivery: { sent: 0, failedEmails: [] as string[] }, welcomeEmailFailed: false };
  }
  const [welcomeDelivery, ...deliveries] = outcome.results;
  const failedEmails = deliveries.flatMap((result, index) => result.status === "rejected" ? [invites[index].email] : []);
  return {
    emailDelivery: { sent: deliveries.length - failedEmails.length, failedEmails },
    welcomeEmailFailed: welcomeDelivery.status === "rejected",
  };
}

// Same rule as the board suggests: initials for several words ("My first project" is MFP), else the first three letters.
function projectKeyFor(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean);
  const key = words.length > 1 ? words.map(word => word[0]).join("").slice(0, 10) : (words[0] ?? "").slice(0, 3);
  if (!/^[A-Z]/.test(key)) return "PRJ";
  return key.length === 1 ? `${key}1` : key;
}

type SetupInput = { workspaceName: string; projectName: string; inviteEmails: string[] };
type Owner = { id: string; name: string | null; email: string | null };

// Creates the workspace with its owner, first project, board, #general channel and pending invites.
async function seedWorkspace(tx: Prisma.TransactionClient, owner: Owner, data: SetupInput) {
  const workspace = await tx.workspace.create({
    data: { name: data.workspaceName, createdById: owner.id },
    select: { id: true, name: true },
  });
  await tx.user.update({ where: { id: owner.id }, data: { lastActiveWorkspaceId: workspace.id } });
  await tx.membership.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "ADMIN" } });
  const project = await tx.project.create({
    data: { workspaceId: workspace.id, name: data.projectName, key: projectKeyFor(data.projectName) },
    select: { id: true },
  });
  await tx.projectAccess.create({ data: { projectId: project.id, userId: owner.id, level: "WRITE" } });
  await createBoardRecord(tx, project.id, "Main board");
  const channel = await tx.channel.create({
    data: { workspaceId: workspace.id, createdById: owner.id, name: "general", description: "Updates and conversations for everyone." },
    select: { id: true },
  });
  await tx.channelMember.create({ data: { channelId: channel.id, workspaceId: workspace.id, userId: owner.id } });
  const invites = await Promise.all(data.inviteEmails.map(async email => {
    const token = createInviteToken();
    await tx.invite.create({
      data: {
        workspaceId: workspace.id,
        email,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(Date.now() + inviteLifetimeMs),
        invitedById: owner.id,
      },
    });
    return { email, token };
  }));
  return { workspace, invites };
}

async function finishOnboarding(
  created: { user: Owner; workspace: { id: string; name: string }; invites: Array<{ email: string; token: string }> },
  fallbackName: string,
  welcome: boolean,
) {
  const ownerName = created.user.name ?? fallbackName;
  const mail = await settleOnboardingMail(
    async () => {
      if (!welcome) return;
      if (!created.user.email) throw new Error("New workspace owner has no email address.");
      return sendWelcomeEmail({ email: created.user.email, name: ownerName, workspaceId: created.workspace.id, workspaceName: created.workspace.name });
    },
    created.invites.map(invite => ({
      email: invite.email,
      send: () => sendWorkspaceInvite({ adminName: ownerName, workspaceName: created.workspace.name, ...invite }),
    })),
  );
  return { user: created.user, workspace: created.workspace, ...mail };
}

function duplicateEmail(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError(409, message);
  throw error;
}

export async function createWorkspaceForAdmin(input: unknown) {
  const data = createWorkspaceSchema.parse(input);
  if (data.inviteEmails.length) assertMailerConfigured();
  const passwordHash = await hash(data.password, 12);
  const message = "Unable to create the workspace. Check the details or sign in.";
  const created = await db.$transaction(async tx => {
    const existingUser = await tx.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } }, select: { id: true } });
    if (existingUser) throw new AppError(409, message);
    const user = await tx.user.create({
      data: { name: data.adminName, email: data.email, passwordHash },
      select: { id: true, name: true, email: true },
    });
    return { user, ...await seedWorkspace(tx, user, data) };
  }).catch(error => duplicateEmail(error, message));
  return finishOnboarding(created, data.adminName, true);
}

/**
 * Create a workspace for a user who signed up via Google OAuth.
 * The Google profile comes from the short-lived encrypted cookie; it has already
 * been verified by the signIn checkpoint (email_verified === true).
 */
export async function createWorkspaceForGoogleUser(googleProfile: GoogleProfile, input: unknown) {
  const data = createWorkspaceGoogleSchema.parse(input);
  if (data.inviteEmails.length) assertMailerConfigured();
  const message = "An account with this email already exists. Please sign in.";
  const created = await db.$transaction(async tx => {
    // Guard against a double submit for the same Google email.
    const existingUser = await tx.user.findFirst({ where: { email: { equals: googleProfile.email, mode: "insensitive" } }, select: { id: true } });
    if (existingUser) throw new AppError(409, message);
    const user = await tx.user.create({
      data: { name: googleProfile.name, email: googleProfile.email, emailVerified: new Date(), image: googleProfile.image ?? null },
      select: { id: true, name: true, email: true },
    });
    // Link the Google account ourselves, because the adapter was bypassed for unknown emails.
    await tx.account.create({
      data: { userId: user.id, type: "oauth", provider: "google", providerAccountId: googleProfile.providerAccountId },
    });
    return { user, ...await seedWorkspace(tx, user, data) };
  }).catch(error => duplicateEmail(error, message));
  return finishOnboarding(created, googleProfile.name, true);
}

// A signed-in user creating another workspace: same setup, no new account and no welcome email.
export async function createWorkspaceForUser(userId: string, input: unknown) {
  const data = createWorkspaceGoogleSchema.parse(input);
  if (data.inviteEmails.length) assertMailerConfigured();
  const created = await db.$transaction(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true } });
    const invites = data.inviteEmails.filter(email => email !== user.email?.toLowerCase());
    return { user, ...await seedWorkspace(tx, user, { ...data, inviteEmails: invites }) };
  });
  return finishOnboarding(created, "A teammate", false);
}
