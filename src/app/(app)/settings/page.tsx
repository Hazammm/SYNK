import { redirect } from "next/navigation";
import SettingsView from "@/features/account/SettingsView";
import { requirePageUser } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ section?: string; inviteDelivery?: string; welcomeEmail?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;
  if (params.section === "Members" || params.inviteDelivery || params.welcomeEmail) {
    const targetId = await resolveActiveWorkspace(user.id);
    if (!targetId) redirect("/create-workspace");
    const query = new URLSearchParams();
    if (params.section) query.set("section", params.section);
    if (params.inviteDelivery) query.set("inviteDelivery", params.inviteDelivery);
    if (params.welcomeEmail) query.set("welcomeEmail", params.welcomeEmail);
    const search = query.toString();
    redirect(`/w/${targetId}/settings${search ? `?${search}` : ""}`);
  }
  return <SettingsView initialSection={params.section} />;
}
