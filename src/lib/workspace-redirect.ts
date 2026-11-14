import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { authOptions } from "./auth";
import { resolveActiveWorkspace } from "./workspace-context";

// Old unscoped URLs such as /board?projectId=… forward to the same screen in the active workspace.
// A route handler sends a real 307, so the page never renders first and then jumps.
export async function redirectToWorkspace(request: Request, path: string) {
  await connection();
  const session = await getServerSession(authOptions);
  const url = new URL(request.url);
  let target = "/login";
  if (session?.user.id) {
    const workspaceId = await resolveActiveWorkspace(session.user.id, url.searchParams.get("workspaceId"));
    target = workspaceId ? `/w/${workspaceId}${path}${url.search}` : "/create-workspace";
  }
  return new Response(null, { status: 307, headers: { Location: target, "Cache-Control": "no-store" } });
}
