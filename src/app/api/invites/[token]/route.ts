import { validateInvite } from "@/features/workspaces/invites";
import { api } from "@/lib/errors";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  return api(async () => {
    const ip = request.headers.get("x-synk-client-ip") ?? "unknown";
    return validateInvite((await context.params).token, ip);
  });
}
