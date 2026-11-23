import PeopleDirectory from "@/features/people/PeopleDirectory";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspacePeoplePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return <PeopleDirectory workspaceId={workspaceId} viewerId={user.id} canManage={user.role === "ADMIN"} />;
}
