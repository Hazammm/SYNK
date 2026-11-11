import OverviewView from "@/features/overview/OverviewView";
import { listWorkspaces } from "@/features/workspaces/service";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const user = await requirePageUser();
  return <OverviewView userName={user.name ?? "Member"} initialWorkspaces={await listWorkspaces(user.id)} initialWorkspaceId={(await searchParams).workspaceId} />;
}
