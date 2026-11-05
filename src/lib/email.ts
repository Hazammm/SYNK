/**
 * Password-reset email dispatcher.
 *
 * In development (or when no SMTP / Resend credentials are configured),
 * the reset URL is printed to the server console so the developer can
 * click it immediately.  In production, swap the body of `send` for a
 * real transactional-email call (Resend, SendGrid, Nodemailer, etc.).
 */

export interface ResetEmail {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: ResetEmail): Promise<void> {
  // In production, replace this with a real email dispatch.
  // Example with Resend:
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({ from: "noreply@synk.app", to, subject: "Reset your Synk password", html: `...` });

  console.log(
    "\n" +
    "┌──────────────────────────────────────────────────────┐\n" +
    "│  🔐  PASSWORD RESET EMAIL (dev mode)                 │\n" +
    "├──────────────────────────────────────────────────────┤\n" +
    `│  To:   ${to.padEnd(44)} │\n` +
    "│  Link: (see below)                                  │\n" +
    "└──────────────────────────────────────────────────────┘\n" +
    `  ${resetUrl}\n`,
  );
}

