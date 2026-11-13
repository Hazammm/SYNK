import DocsView from "@/features/docs/DocsView";
import { listWorkspaces } from "@/features/workspaces/service";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default async function DocsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; projectId?: string; doc?: string }> }) {
  const user = await requirePageUser();
  return <DocsView initialWorkspaces={await listWorkspaces(user.id)} initial={await searchParams} />;
}
