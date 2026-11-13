import TimeView from "@/features/time/TimeView";
import { listWorkspaces } from "@/features/workspaces/service";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default async function TimePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; projectId?: string }> }) {
  const user = await requirePageUser();
  return <TimeView initialWorkspaces={await listWorkspaces(user.id)} initial={await searchParams} />;
}
