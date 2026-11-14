import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readGoogleProfileCookie } from "@/lib/google-profile-cookie";
import CreateWorkspaceWizard from "@/features/workspaces/CreateWorkspaceWizard";

export default function CreateWorkspacePage({ searchParams }: {
  searchParams: Promise<{ from?: string }>;
}) {
  return (
    <Suspense fallback={<main role="status" style={{ padding: 32 }}>Loading workspace setup…</main>}>
      <CreateWorkspaceContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CreateWorkspaceContent({ searchParams }: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const isGoogleMode = params.from === "google";

  if (isGoogleMode) {
    const profile = await readGoogleProfileCookie();
    if (!profile) {
      // Cookie missing or expired — send back to login with a friendly message.
      redirect("/login?error=google_expired");
    }
    // profile is narrowed to GoogleProfile here (not null).
    return <CreateWorkspaceWizard googleMode googleName={profile.name} googleEmail={profile.email} />;
  }

  await connection(); // the session check needs the live request
  const session = await getServerSession(authOptions);
  return <CreateWorkspaceWizard signedIn={Boolean(session?.user.id)} />;
}
