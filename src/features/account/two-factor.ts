import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, openSecret, otpauthUrl, sealSecret, verifyTotp } from "../../lib/totp";

const codeSchema = z.string().trim().min(6, "Enter the 6-digit code.").max(20);
export const confirmTwoFactorSchema = z.object({ code: codeSchema }).strict();
export const disableTwoFactorSchema = z.object({ password: z.string().min(1).max(72), code: codeSchema }).strict();

// Step 1: a new secret to add to an authenticator app. Nothing changes until it is confirmed.
export async function startTwoFactor(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, passwordHash: true, totpSecret: true } });
  if (!user.passwordHash) throw new AppError(400, "Two-factor sign-in protects your Synk password. You sign in with another provider, so it is handled there.");
  if (user.totpSecret) throw new AppError(409, "Two-factor sign-in is already on.");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpPendingSecret: sealSecret(secret) } });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email ?? "account") };
}

// Step 2: a code from the app proves it was set up. Returns recovery codes, shown only this once.
export async function confirmTwoFactor(userId: string, input: unknown) {
  const { code } = confirmTwoFactorSchema.parse(input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { totpPendingSecret: true } });
  if (!user.totpPendingSecret) throw new AppError(400, "Start setting up two-factor sign-in first.");
  if (!verifyTotp(openSecret(user.totpPendingSecret), code)) throw new AppError(400, "That code is not right. Check the time on your phone and try the newest code.");
  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpRecoveryHashes: recoveryCodes.map(hashRecoveryCode) },
  });
  return { enabled: true, recoveryCodes };
}

// A code from the app, or an unused recovery code (which is then used up).
export async function checkSecondFactor(userId: string, code: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpRecoveryHashes: true } });
  if (!user?.totpSecret) return true;
  if (verifyTotp(openSecret(user.totpSecret), code)) return true;
  const hash = hashRecoveryCode(code);
  if (!user.totpRecoveryHashes.includes(hash)) return false;
  // Only one sign-in can use a recovery code, even if two arrive at once.
  const { count } = await db.user.updateMany({
    where: { id: userId, totpRecoveryHashes: { has: hash } },
    data: { totpRecoveryHashes: user.totpRecoveryHashes.filter(item => item !== hash) },
  });
  return count === 1;
}

export async function disableTwoFactor(userId: string, input: unknown) {
  const { password, code } = disableTwoFactorSchema.parse(input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, totpSecret: true } });
  if (!user.totpSecret) throw new AppError(400, "Two-factor sign-in is already off.");
  if (!user.passwordHash || !(await compare(password, user.passwordHash))) throw new AppError(400, "Your password is not right.");
  if (!(await checkSecondFactor(userId, code))) throw new AppError(400, "That code is not right.");
  await db.user.update({ where: { id: userId }, data: { totpSecret: null, totpPendingSecret: null, totpRecoveryHashes: [] } });
  return { enabled: false };
}
