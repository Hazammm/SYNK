import ChatWorkspace from "@/features/chat/ChatWorkspace";
import { listWorkspaces } from "@/features/workspaces/service";
import { requirePageUser } from "@/lib/session";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const user = await requirePageUser();
  return <ChatWorkspace initialWorkspaces={await listWorkspaces(user.id)} initialWorkspaceId={(await searchParams).workspaceId} />;
}
