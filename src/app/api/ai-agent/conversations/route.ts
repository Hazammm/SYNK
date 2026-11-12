import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api, AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { deleteConversations, listConversations } from "@/features/agent/service";

// GET /api/ai-agent/conversations?workspaceId=… lists the caller's own conversations, newest first.
export async function GET(request: Request) {
  // Awaited outside api(): during the build this tells Next.js the route is per-request,
  // and the error handler must not swallow that signal.
  await connection();
  return api(async () => {
    const user = await requireUser();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) throw new AppError(400, "Choose a workspace.");
    return { conversations: await listConversations(user.id, workspaceId) };
  });
}

// DELETE removes the caller's conversations; ?workspaceId=… limits it to one workspace.
export async function DELETE(request: Request) {
  await connection();
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    return deleteConversations(user.id, new URL(request.url).searchParams.get("workspaceId"));
  });
}
