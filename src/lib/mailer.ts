import nodemailer from "nodemailer";
import { AppError } from "./errors";

type InviteEmail = { adminName: string; workspaceName: string; email: string; token: string };
type WelcomeEmail = { name: string; workspaceId: string; workspaceName: string; email: string };
type PasswordResetEmail = { email: string; resetUrl: string };
const SMTP_TIMEOUT_MS = 10_000;

function mailConfig() {
  const { MAILTRAP_HOST, MAILTRAP_PORT, MAILTRAP_USER, MAILTRAP_PASS, MAIL_FROM } = process.env;
  const port = Number(MAILTRAP_PORT);
  if (!MAILTRAP_HOST || !MAILTRAP_USER || !MAILTRAP_PASS || !MAIL_FROM || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError(503, "Email delivery is not configured. Set the Mailtrap environment variables.");
  }
  return { host: MAILTRAP_HOST, port, user: MAILTRAP_USER, password: MAILTRAP_PASS, from: MAIL_FROM };
}

export function assertMailerConfigured() {
  mailConfig();
}

function createTransport(config: ReturnType<typeof mailConfig>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]!);
}

async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  const config = mailConfig();
  const transport = createTransport(config);

  try {
    await transport.sendMail({ from: config.from, ...message });
  } finally {
    transport.close();
  }
}

export async function sendWorkspaceInvite({ adminName, workspaceName, email, token }: InviteEmail) {
  const joinUrl = new URL(`/join/${token}`, process.env.NEXTAUTH_URL ?? "http://localhost:3000").toString();
  const subject = `${adminName} invited you to join ${workspaceName} on Synk`.replace(/[\r\n]+/g, " ");
  const safeAdmin = escapeHtml(adminName);
  const safeWorkspace = escapeHtml(workspaceName);
  const safeUrl = escapeHtml(joinUrl);
  await sendMail({
    to: email,
    subject,
    text: `${adminName} invited you to join ${workspaceName} on Synk.\n\nJoin workspace: ${joinUrl}\n\nThis link expires in 7 days.`,
    html: `<p>${safeAdmin} invited you to join <strong>${safeWorkspace}</strong> on Synk.</p><p><a href="${safeUrl}">Join workspace</a></p><p>This link expires in 7 days.</p>`,
  });
}

export async function sendWelcomeEmail({ email, name, workspaceId, workspaceName }: WelcomeEmail) {
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const workspaceUrl = new URL(`/w/${encodeURIComponent(workspaceId)}/overview`, appUrl).toString();
  const safeName = escapeHtml(name);
  const safeWorkspace = escapeHtml(workspaceName);
  const safeUrl = escapeHtml(workspaceUrl);

  await sendMail({
    to: email,
    subject: `Welcome to Synk, ${name}`.replace(/[\r\n]+/g, " "),
    text: `Hi ${name},\n\nWelcome to Synk! Your workspace, ${workspaceName}, is ready.\n\nOpen your workspace: ${workspaceUrl}\n\nYou can invite teammates and manage your workspace from Settings.`,
    html: `<p>Hi ${safeName},</p><p>Welcome to Synk! Your workspace, <strong>${safeWorkspace}</strong>, is ready.</p><p><a href="${safeUrl}">Open your workspace</a></p><p>You can invite teammates and manage your workspace from Settings.</p>`,
  });
}

export async function sendPasswordResetEmail({ email, resetUrl }: PasswordResetEmail) {
  let config;
  try {
    config = mailConfig();
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.log(`\n[synk] 🔐 Password reset link for ${email} (dev mode, not emailed):\n  ${resetUrl}\n`);
    return;
  }

  const transport = createTransport(config);
  const safeUrl = escapeHtml(resetUrl);

  try {
    await transport.sendMail({
      from: config.from,
      to: email,
      subject: "Reset your Synk password",
      text: `Someone asked to reset your Synk password.\n\nOpen this link within 15 minutes to choose a new one:\n${resetUrl}\n\nIf this wasn't you, ignore this email; your password will not change.`,
      html: `<p>Someone asked to reset your Synk password.</p><p><a href="${safeUrl}">Reset your password</a></p><p>This link expires in 15 minutes. If this wasn't you, ignore this email; your password will not change.</p>`,
    });
  } finally {
    transport.close();
  }
}
