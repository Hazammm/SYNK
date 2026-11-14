import AuthPage from "@/components/AuthPage";

export const instant = false;

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const params = await searchParams;
  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const codeHosts = [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET ? [{ id: "github", name: "GitHub" }] : []),
    ...(process.env.BITBUCKET_ID && process.env.BITBUCKET_SECRET ? [{ id: "bitbucket", name: "Bitbucket" }] : []),
  ];
  return (
    <AuthPage
      inviteToken={params.invite ?? ""}
      authError={Boolean(params.error)}
      googleEnabled={googleEnabled}
      codeHosts={codeHosts}
    />
  );
}
