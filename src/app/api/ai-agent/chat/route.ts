import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { sendAgentTurn } from "@/features/agent/service";

// Body { workspaceId, message } starts a conversation and { conversationId, message } continues one.
// { conversationId, decision: "approve" | "reject" } answers a change that is waiting for confirmation.
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    rateLimit(`agent-chat:${user.id}`, 20);
    return sendAgentTurn(user.id, await readJson(request));
  });
}
