import AppsView from "@/features/apps/AppsView";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceAppsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  await requireWorkspaceUser(workspaceId);
  return <AppsView workspaceId={workspaceId} />;
}
