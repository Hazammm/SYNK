import { redirect } from "next/navigation";
import SettingsView from "@/features/account/SettingsView";
import { requirePageUser } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

// Settings live inside the active workspace; this page only stays for someone in no workspace.
export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ section?: string; inviteDelivery?: string; welcomeEmail?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;
  const targetId = await resolveActiveWorkspace(user.id);
  if (!targetId) return <SettingsView initialSection={params.section} />;
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const search = query.toString();
  redirect(`/w/${targetId}/settings${search ? `?${search}` : ""}`);
}
