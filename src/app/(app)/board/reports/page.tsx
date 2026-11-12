import Tracker from "@/features/tickets/Tracker";
import type { Selection } from "@/features/tickets/ui";
import { listWorkspaces } from "@/features/workspaces/service";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Selection> }) {
  const user = await requirePageUser();
  return <Tracker view="reports" userId={user.id} initialWorkspaces={await listWorkspaces(user.id)} initial={await searchParams} />;
}
