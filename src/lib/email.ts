import { sendPasswordResetEmail as sendMailtrapPasswordReset } from "./mailer";

export interface ResetEmail {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: ResetEmail): Promise<void> {
  await sendMailtrapPasswordReset({ email: to, resetUrl });
}
