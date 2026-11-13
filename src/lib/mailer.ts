import nodemailer from "nodemailer";
import { MailtrapTransport } from "mailtrap";
import { AppError } from "./errors";

type InviteEmail = { adminName: string; workspaceName: string; email: string; token: string };
type WelcomeEmail = { name: string; workspaceId: string; workspaceName: string; email: string };
type PasswordResetEmail = { email: string; resetUrl: string };
type MailConfig =
  | { mode: "api"; token: string; from: string }
  | { mode: "smtp"; host: string; port: number; user: string; password: string; from: string };
const SMTP_TIMEOUT_MS = 10_000;

function mailConfig(): MailConfig {
  const { MAILTRAP_API_TOKEN, MAILTRAP_HOST, MAILTRAP_PORT, MAILTRAP_USER, MAILTRAP_PASS, MAIL_FROM } = process.env;
  if (MAILTRAP_API_TOKEN) {
    if (!MAIL_FROM) {
      throw new AppError(503, "Email delivery is not configured. Set MAIL_FROM for the Mailtrap sender address.");
    }
    return { mode: "api", token: MAILTRAP_API_TOKEN, from: MAIL_FROM };
  }

  const port = Number(MAILTRAP_PORT);
  if (!MAILTRAP_HOST || !MAILTRAP_USER || !MAILTRAP_PASS || !MAIL_FROM || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError(503, "Email delivery is not configured. Set MAILTRAP_API_TOKEN and MAIL_FROM, or the Mailtrap SMTP variables.");
  }
  return { mode: "smtp", host: MAILTRAP_HOST, port, user: MAILTRAP_USER, password: MAILTRAP_PASS, from: MAIL_FROM };
}

export function assertMailerConfigured() {
  mailConfig();
}

function createTransport(config: ReturnType<typeof mailConfig>) {
  if (config.mode === "api") {
    return nodemailer.createTransport(MailtrapTransport({ token: config.token }));
  }

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

async function sendMail(
  message: { to: string; subject: string; text: string; html: string },
  config = mailConfig(),
) {
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
    text: `YOU'RE INVITED TO SYNK\n\n${adminName} invited you to join ${workspaceName} on Synk.\n\nJoin your team and start collaborating in one shared workspace.\n\nACCEPT YOUR INVITATION\n${joinUrl}\n\nThis invitation link expires in 7 days and can only be used once. If you weren't expecting this invitation, you can ignore this email.\n\nThe Synk team`,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>You're invited to Synk</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;font-size:1px;color:#f3f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safeAdmin} invited you to collaborate in ${safeWorkspace} on Synk.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5f9;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 4px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" width="34" height="34" style="width:34px;height:34px;border-radius:9px;background-color:#2563eb;color:#ffffff;font-size:21px;font-weight:bold;">s</td>
                    <td style="padding-left:10px;color:#172033;font-size:21px;font-weight:bold;letter-spacing:-0.5px;">synk</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border:1px solid #e4e8f0;border-radius:16px;background-color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:38px 40px 34px;background-color:#111827;">
                      <p style="margin:0 0 12px;color:#93b4ff;font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;">A seat is waiting for you</p>
                      <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;letter-spacing:-0.8px;">You're invited!</h1>
                      <p style="margin:14px 0 0;color:#cbd5e1;font-size:16px;line-height:1.6;"><strong style="color:#ffffff;">${safeAdmin}</strong> invited you to join their team on Synk.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 40px 38px;">
                      <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;">Your team workspace</p>
                      <p style="margin:0 0 25px;color:#172033;font-size:21px;font-weight:bold;line-height:1.4;">${safeWorkspace}</p>
                      <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">Bring conversations and team work together in one place. Accept your invitation to join your teammates.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td align="center" style="border-radius:8px;background-color:#2563eb;">
                            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Accept invitation&nbsp; &rarr;</a>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                        <tr>
                          <td style="padding:14px 16px;border:1px solid #e4e8f0;border-radius:9px;background-color:#f8fafc;color:#64748b;font-size:13px;line-height:1.6;">
                            This link expires in <strong style="color:#172033;">7 days</strong> and can only be used once. If you weren't expecting this invitation, you can safely ignore this email.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 12px 0;color:#8993a5;font-size:12px;line-height:1.6;">Made for teams that move work forward.<br>You're receiving this because someone invited you to a Synk workspace.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
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
    text: `WELCOME TO SYNK\n\nHi ${name},\n\nYour workspace is ready. ${workspaceName} is the place to bring your team together and keep work moving.\n\nOPEN YOUR WORKSPACE\n${workspaceUrl}\n\nGET STARTED\n- Start a conversation in the general channel.\n- Invite teammates from Settings > Members.\n\nWe're glad you're here,\nThe Synk team`,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>Welcome to Synk</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;font-size:1px;color:#f3f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your ${safeWorkspace} workspace is ready. Jump in and get your team started.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5f9;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 4px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" width="34" height="34" style="width:34px;height:34px;border-radius:9px;background-color:#2563eb;color:#ffffff;font-size:21px;font-weight:bold;">s</td>
                    <td style="padding-left:10px;color:#172033;font-size:21px;font-weight:bold;letter-spacing:-0.5px;">synk</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border:1px solid #e4e8f0;border-radius:16px;background-color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:38px 40px 34px;background-color:#111827;">
                      <p style="margin:0 0 12px;color:#93b4ff;font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;">Your team space is ready</p>
                      <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;letter-spacing:-0.8px;">Welcome to Synk, ${safeName}!</h1>
                      <p style="margin:14px 0 0;color:#cbd5e1;font-size:16px;line-height:1.6;">A great place to get work moving starts with a great team. Your workspace is ready when you are.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 40px 38px;">
                      <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;">Your workspace</p>
                      <p style="margin:0 0 25px;color:#172033;font-size:21px;font-weight:bold;line-height:1.4;">${safeWorkspace}</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td align="center" style="border-radius:8px;background-color:#2563eb;">
                            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Open your workspace&nbsp; &rarr;</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:30px 0 14px;color:#172033;font-size:15px;font-weight:bold;">A couple of ways to get started</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td valign="top" width="28" style="padding:0 0 12px;color:#2563eb;font-size:16px;font-weight:bold;">01</td>
                          <td style="padding:0 0 12px;color:#475569;font-size:14px;line-height:1.6;">Say hello in your <strong style="color:#172033;">general</strong> channel.</td>
                        </tr>
                        <tr>
                          <td valign="top" width="28" style="padding:0;color:#2563eb;font-size:16px;font-weight:bold;">02</td>
                          <td style="padding:0;color:#475569;font-size:14px;line-height:1.6;">Bring your team in from <strong style="color:#172033;">Settings &gt; Members</strong>.</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 12px 0;color:#8993a5;font-size:12px;line-height:1.6;">Made for teams that move work forward.<br>You're receiving this because a Synk workspace was created for you.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
}

export async function sendPasswordResetEmail({ email, resetUrl }: PasswordResetEmail) {
  let config: MailConfig;
  try {
    config = mailConfig();
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && error instanceof AppError && error.status === 503) {
      console.log(`\n[synk] 🔐 Password reset link for ${email} (dev mode, not emailed):\n  ${resetUrl}\n`);
      return;
    }
    throw error;
  }

  const safeUrl = escapeHtml(resetUrl);
  await sendMail({
    to: email,
    subject: "Reset your Synk password",
    text: `ACCOUNT SECURITY\n\nReset your password\n\nWe received a request to reset the password for the Synk account associated with ${email}.\n\nRESET YOUR PASSWORD\n${resetUrl}\n\nThis link expires in 15 minutes and can only be used once. If you didn't request a password reset, you can safely ignore this email — your password will not change.\n\nThe Synk team`,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>Reset your Synk password</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;font-size:1px;color:#f3f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Reset your Synk password — this link expires in 15 minutes.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5f9;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 4px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" width="34" height="34" style="width:34px;height:34px;border-radius:9px;background-color:#2563eb;color:#ffffff;font-size:21px;font-weight:bold;">s</td>
                    <td style="padding-left:10px;color:#172033;font-size:21px;font-weight:bold;letter-spacing:-0.5px;">synk</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border:1px solid #e4e8f0;border-radius:16px;background-color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:38px 40px 34px;background-color:#111827;">
                      <p style="margin:0 0 12px;color:#93b4ff;font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;">Account security</p>
                      <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;letter-spacing:-0.8px;">Reset your password</h1>
                      <p style="margin:14px 0 0;color:#cbd5e1;font-size:16px;line-height:1.6;">We received a request to reset the password for the Synk account associated with this email address.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 40px 38px;">
                      <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">Click the button below to choose a new password. If you didn't request this, you can safely ignore this email&nbsp;&mdash; your password will not change.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td align="center" style="border-radius:8px;background-color:#2563eb;">
                            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Reset your password&nbsp; &rarr;</a>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                        <tr>
                          <td style="padding:14px 16px;border:1px solid #e4e8f0;border-radius:9px;background-color:#f8fafc;color:#64748b;font-size:13px;line-height:1.6;">
                            This link expires in <strong style="color:#172033;">15 minutes</strong> and can only be used once. If you didn't make this request, no action is needed.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 12px 0;color:#8993a5;font-size:12px;line-height:1.6;">Made for teams that move work forward.<br>You're receiving this because a password reset was requested for your Synk account.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  }, config);
}
