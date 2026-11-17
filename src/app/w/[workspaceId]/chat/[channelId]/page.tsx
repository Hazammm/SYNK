import ChatWorkspace from "@/features/chat/ChatWorkspace";
import { listWorkspaces } from "@/features/workspaces/service";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceChannelChatPage({
  params,
}: {
  params: Promise<{ workspaceId: string; channelId: string }>;
}) {
  const { workspaceId, channelId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return (
    <ChatWorkspace
      initialWorkspaces={await listWorkspaces(user.id)}
      initialWorkspaceId={workspaceId}
      initialChannelId={channelId}
    />
  );
}

