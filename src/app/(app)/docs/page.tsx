import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function DocsPage() {
  const user = await requirePageUser();
  const targetId = await resolveActiveWorkspace(user.id);
  if (!targetId) redirect("/create-workspace");
  redirect(`/w/${targetId}/docs`);
}
