import { Suspense, type ReactNode } from "react";
import SynkShell from "@/components/SynkShell";
import { requirePageUser } from "@/lib/session";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main style={{ padding: 32 }}>Loading your workspace…</main>}><AuthenticatedLayout>{children}</AuthenticatedLayout></Suspense>;
}

async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return <SynkShell userName={user.name ?? "Member"}>{children}</SynkShell>;
}
