import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const user = await requirePageUser();
  const search = await searchParams;
  const targetId = await resolveActiveWorkspace(user.id, search.workspaceId);
  if (!targetId) {
    redirect("/create-workspace");
  }
  redirect(`/w/${targetId}/chat`);
}
