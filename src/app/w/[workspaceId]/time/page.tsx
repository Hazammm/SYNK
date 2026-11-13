import TimeView from "@/features/time/TimeView";
import { listWorkspaces } from "@/features/workspaces/service";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceTimePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return (
    <TimeView
      initialWorkspaces={await listWorkspaces(user.id)}
      initial={{ ...(await searchParams), workspaceId }}
    />
  );
}
