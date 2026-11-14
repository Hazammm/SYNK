import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function Home() {
  await connection();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  const targetId = await resolveActiveWorkspace(session.user.id);
  if (!targetId) {
    redirect("/create-workspace");
  }
  redirect(`/w/${targetId}/overview`);
}
