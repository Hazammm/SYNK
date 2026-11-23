import type { ReactNode } from "react";
import { HuddleProvider } from "@/features/chat/HuddleBar";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function ChatLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return <HuddleProvider viewerId={user.id}>{children}</HuddleProvider>;
}
