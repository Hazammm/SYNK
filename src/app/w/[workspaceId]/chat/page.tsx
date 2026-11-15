import ChatWorkspace from "@/features/chat/ChatWorkspace";
import { listWorkspaces } from "@/features/workspaces/service";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ newChannel?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return (
    <ChatWorkspace
      initialWorkspaces={await listWorkspaces(user.id)}
      initialWorkspaceId={workspaceId}
      startNewChannel={(await searchParams).newChannel === "1"}
    />
  );
}

