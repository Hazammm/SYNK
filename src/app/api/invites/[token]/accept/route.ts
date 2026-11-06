import { acceptInvite } from "@/features/workspaces/invites";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  return api(async () => {
    assertSameOrigin(request);
    return acceptInvite((await context.params).token, await readJson(request));
  }, 201);
}
