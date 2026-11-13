import DocsView from "@/features/docs/DocsView";
import { listWorkspaces } from "@/features/workspaces/service";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceDocsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ projectId?: string; doc?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return (
    <DocsView
      initialWorkspaces={await listWorkspaces(user.id)}
      initial={{ ...(await searchParams), workspaceId }}
    />
  );
}
