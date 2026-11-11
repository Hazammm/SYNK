import AuthPage from "@/components/AuthPage";

export const instant = false;

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const params = await searchParams;
  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <AuthPage
      inviteToken={params.invite ?? ""}
      authError={Boolean(params.error)}
      googleEnabled={googleEnabled}
    />
  );
}
