import SettingsView from "@/features/account/SettingsView";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ section?: string; inviteDelivery?: string; welcomeEmail?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  const search = await searchParams;
  return <SettingsView
    initialSection={search.section}
    workspace={{ id: workspaceId, role: user.role, userId: user.id }}
    inviteDeliveryFailed={search.inviteDelivery === "failed"}
    welcomeEmailFailed={search.welcomeEmail === "failed"}
  />;
}
