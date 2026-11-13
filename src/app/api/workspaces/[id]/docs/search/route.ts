import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { searchDocs } from "@/features/docs/service";
type Context = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/docs/search?query=… searches the pages of projects the caller can open.
export async function GET(request: Request, context: Context) {
  await connection();
  return api(async () => {
    const user = await requireUser();
    return { results: await searchDocs(user.id, (await context.params).id, { query: new URL(request.url).searchParams.get("query") ?? "" }) };
  });
}
