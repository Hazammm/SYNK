import nodemailer from "nodemailer";
import { AppError } from "./errors";

type InviteEmail = { adminName: string; workspaceName: string; email: string; token: string };

function mailConfig() {
  const { MAILTRAP_HOST, MAILTRAP_PORT, MAILTRAP_USER, MAILTRAP_PASS, MAIL_FROM } = process.env;
  const port = Number(MAILTRAP_PORT);
  if (!MAILTRAP_HOST || !MAILTRAP_USER || !MAILTRAP_PASS || !MAIL_FROM || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError(503, "Email invitations are not configured. Set the Mailtrap environment variables.");
  }
  return { host: MAILTRAP_HOST, port, user: MAILTRAP_USER, password: MAILTRAP_PASS, from: MAIL_FROM };
}

export function assertMailerConfigured() {
  mailConfig();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]!);
}

export async function sendWorkspaceInvite({ adminName, workspaceName, email, token }: InviteEmail) {
  const config = mailConfig();
  const joinUrl = new URL(`/join/${token}`, process.env.NEXTAUTH_URL ?? "http://localhost:3000").toString();
  const subject = `${adminName} invited you to join ${workspaceName} on Synk`.replace(/[\r\n]+/g, " ");
  const safeAdmin = escapeHtml(adminName);
  const safeWorkspace = escapeHtml(workspaceName);
  const safeUrl = escapeHtml(joinUrl);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: email,
      subject,
      text: `${adminName} invited you to join ${workspaceName} on Synk.\n\nJoin workspace: ${joinUrl}\n\nThis link expires in 7 days.`,
      html: `<p>${safeAdmin} invited you to join <strong>${safeWorkspace}</strong> on Synk.</p><p><a href="${safeUrl}">Join workspace</a></p><p>This link expires in 7 days.</p>`,
    });
  } finally {
    transport.close();
  }
}
