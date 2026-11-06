import AuthPage from "@/components/AuthPage";

export const instant = false;

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const params = await searchParams;
  return <AuthPage inviteToken={params.invite ?? ""} authError={Boolean(params.error)} />;
}
