import { Suspense, type ReactNode } from "react";
import SynkShell from "@/components/SynkShell";
import { PageLoading } from "@/components/Status";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading as="main" full label="Loading your workspace…" />}><AuthenticatedLayout>{children}</AuthenticatedLayout></Suspense>;
}

async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return <SynkShell userName={user.name ?? "Member"}>{children}</SynkShell>;
}
