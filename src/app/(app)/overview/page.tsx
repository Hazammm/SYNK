import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function OverviewPage() {
  const user = await requirePageUser();
  const targetId = await resolveActiveWorkspace(user.id);
  if (!targetId) {
    redirect("/create-workspace");
  }
  redirect(`/w/${targetId}/overview`);
}
