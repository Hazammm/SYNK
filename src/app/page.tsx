import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Landing from "@/features/landing/Landing";
import { resolveActiveWorkspace } from "@/lib/workspace-context";

export const instant = false;

export default async function Home() {
  await connection();
  const session = await getServerSession(authOptions);
  // Signed-out visitors see the public landing page; everyone else goes straight to their workspace.
  if (!session?.user?.id) {
    return <Landing />;
  }
  const targetId = await resolveActiveWorkspace(session.user.id);
  if (!targetId) {
    redirect("/create-workspace");
  }
  redirect(`/w/${targetId}/overview`);
}
