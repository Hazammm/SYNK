import { acceptInviteForExistingUser } from "@/features/workspaces/invites";
import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/session";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  return api(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    return acceptInviteForExistingUser((await context.params).token, user.id);
  });
}
