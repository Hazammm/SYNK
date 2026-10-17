import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { createWorkspace, listWorkspaces } from "@/features/workspaces/service";

export async function GET() { return api(async () => ({ workspaces: await listWorkspaces((await requireUser()).id) })); }
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    return { workspace: await createWorkspace(user.id, await readJson(request)) };
  }, 201);
}
