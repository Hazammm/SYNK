import SynkScreen from "@/components/SynkScreen";
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

  return (
    <SynkScreen
      screen="settings"
      workspaceId={workspaceId}
      role={user.role}
      userId={user.id}
      userName={user.name ?? ""}
      userEmail={user.email ?? ""}
      initialSettingsSection={search.section}
      inviteDeliveryFailed={search.inviteDelivery === "failed"}
      welcomeEmailFailed={search.welcomeEmail === "failed"}
    />
  );
}
