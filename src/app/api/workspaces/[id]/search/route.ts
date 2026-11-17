import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { searchWorkspace } from "@/features/search/service";
type Context = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/search?query=… searches tickets, pages and messages the caller can see.
export async function GET(request: Request, context: Context) {
  await connection();
  return api(async () => {
    const user = await requireUser();
    return { results: await searchWorkspace(user.id, (await context.params).id, { query: new URL(request.url).searchParams.get("query") ?? "" }) };
  });
}
