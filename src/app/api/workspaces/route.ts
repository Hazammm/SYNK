import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { createWorkspaceForAdmin } from "@/features/workspaces/onboarding";
import { listWorkspaces } from "@/features/workspaces/service";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() { return api(async () => ({ workspaces: await listWorkspaces((await requireUser()).id) })); }
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
    rateLimit(`create-workspace:${clientIp}`, 5, 15 * 60_000);
    return createWorkspaceForAdmin(await readJson(request));
  }, 201);
}
