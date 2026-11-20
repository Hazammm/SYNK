import { redirect } from "next/navigation";
import ChatWorkspace from "@/features/chat/ChatWorkspace";
import { createDirectMessage } from "@/features/chat/service";
import { listWorkspaces } from "@/features/workspaces/service";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ newChannel?: string; dm?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  const search = await searchParams;
  // "Message" in the people directory: open the direct message with that person (it is reused if one exists).
  if (search.dm && search.dm !== user.id) {
    const dm = await createDirectMessage(user.id, workspaceId, { userIds: [search.dm] }).catch(() => null);
    if (dm) redirect(`/w/${workspaceId}/chat/${dm.id}`);
  }
  return (
    <ChatWorkspace
      initialWorkspaces={await listWorkspaces(user.id)}
      initialWorkspaceId={workspaceId}
      startNewChannel={search.newChannel === "1"}
      viewerId={user.id}
    />
  );
}
