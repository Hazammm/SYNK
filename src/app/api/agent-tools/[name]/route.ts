import { api, AppError } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { verifyAgentToken } from "@/lib/agent-token";
import { runAgentTool } from "@/features/agent/tools";
type Context = { params: Promise<{ name: string }> };

// Called by the agent service, never by a browser. The bearer token was minted by this server
// for one person and workspace, so the tool runs with exactly that person's access.
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new AppError(401, "The agent token is invalid or has expired.");
    const { userId, workspaceId, conversationId } = verifyAgentToken(token);
    return runAgentTool({ userId, workspaceId, conversationId }, (await context.params).name, await readJson(request));
  });
}
