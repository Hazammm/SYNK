// The message the sign-in page shows for an ?error= code. NextAuth sends its own codes here (pages.error is
// /login), and Synk's routes add a few of their own. Each gets a plain explanation instead of a blanket
// "Invalid email or password".
const messages: Record<string, string> = {
  CredentialsSignin: "Invalid email or password",
  OAuthAccountNotLinked: "That account is already connected to a different Synk user. Sign in as that user to use it.",
  AccessDenied: "Sign-in was cancelled or is not allowed for this account.",
  google_expired: "Your Google sign-in took too long. Please continue with Google again.",
  rate_limit: "Too many attempts. Wait a minute, then try again.",
  unauthorized: "Your session has ended. Please sign in again.",
};

export function authErrorMessage(code: string | undefined): string {
  if (!code) return "";
  return messages[code] ?? "We could not finish signing in. Please try again.";
}
