import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageLoading } from "@/components/Status";
import { getAccount } from "@/features/account/service";
import ProfileSetup from "@/features/account/ProfileSetup";
import { db } from "@/lib/db";
import { requireLoginSession } from "@/lib/session";

export default function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<PageLoading as="main" full label="Loading your profile…" />}>
      <WelcomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function WelcomeContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection();
  const { next } = await searchParams;
  // Only send people back inside a workspace, never to another site.
  const destination = next?.startsWith("/w/") ? next : "/";
  const { user, sessionId } = await requireLoginSession().catch(() => redirect("/login"));
  const done = await db.user.findUnique({ where: { id: user.id }, select: { profileSetupAt: true } });
  if (done?.profileSetupAt) redirect(destination);
  return <ProfileSetup account={await getAccount(user.id, sessionId)} next={destination} />;
}
