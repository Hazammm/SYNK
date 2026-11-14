import Link from "next/link";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { headers } from "next/headers";
import { ThemeBar } from "@/components/SynkShell";
import styles from "@/components/Auth.module.css";
import { ExistingInviteJoin, InviteSignInLink, SwitchAccountForInvite } from "@/features/workspaces/ExistingInviteActions";
import JoinInviteForm from "@/features/workspaces/JoinInviteForm";
import { validateInvite } from "@/features/workspaces/invites";
import { authOptions } from "@/lib/auth";
import { inviteTokenSchema } from "@/lib/validation";

export const instant = false;

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const parsedToken = inviteTokenSchema.safeParse(token);
  const validToken = parsedToken.success ? parsedToken.data : "";
  const ip = (await headers()).get("x-synk-client-ip") ?? "unknown";
  const invite = parsedToken.success ? await validateInvite(parsedToken.data, ip) : { valid: false as const };

  return <main className={styles.authPage}>
    <Link href="/" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
    {!invite.valid ? <section className={styles.authCard}>
      <div className={styles.logo}>s</div>
      <h1>This invite is no longer valid</h1>
      <p className={styles.tagline}>Ask your admin for a new one.</p>
      <Link className={styles.inviteSignIn} href="/login">Go to sign in</Link>
    </section> : <section className={styles.authCard}>
      <div className={styles.logo}>s</div>
      <h1>You&apos;ve been invited to {invite.workspaceName}</h1>
      <p className={styles.tagline}>{invite.requiresSignIn ? "This email already has a Synk account." : "Create your account to join the workspace."}</p>
      {invite.requiresSignIn ? <ExistingAccountJoin token={validToken} email={invite.email} /> : <JoinInviteForm token={validToken} email={invite.email} />}
    </section>}
    <ThemeBar />
  </main>;
}

async function ExistingAccountJoin({ token, email }: { token: string; email: string }) {
  const session = await getServerSession(authOptions);
  const activeEmail = session?.user?.id ? session.user.email?.toLowerCase() : undefined;
  if (!activeEmail) return <InviteSignInLink token={token} />;
  if (activeEmail === email.toLowerCase()) return <ExistingInviteJoin token={token} />;
  return <div className={styles.form}>
    <p className={styles.inviteHint}>Sign in as {email} to accept this invitation.</p>
    <SwitchAccountForInvite token={token} />
  </div>;
}
