import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ section?: string; inviteDelivery?: string; welcomeEmail?: string }>;
}) {
  const user = await requirePageUser();
  const targetId = await resolveActiveWorkspace(user.id);
  if (!targetId) redirect("/create-workspace");
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.section) qs.set("section", params.section);
  if (params.inviteDelivery) qs.set("inviteDelivery", params.inviteDelivery);
  if (params.welcomeEmail) qs.set("welcomeEmail", params.welcomeEmail);
  const qStr = qs.toString();
  redirect(`/w/${targetId}/settings${qStr ? `?${qStr}` : ""}`);
}
