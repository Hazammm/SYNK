import SynkScreen from "@/components/SynkScreen";
import { requirePageUser } from "@/lib/session";

export const instant = false;

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ section?: string; inviteDelivery?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;
  return <SynkScreen
    screen="settings"
    workspaceId={user.workspaceId}
    role={user.role ?? "MEMBER"}
    userId={user.id}
    initialSettingsSection={params.section}
    inviteDeliveryFailed={params.inviteDelivery === "failed"}
  />;
}
