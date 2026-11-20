import { connection } from "next/server";
import { errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { exportWorkspace } from "@/features/workspaces/admin";

type Context = { params: Promise<{ id: string }> };

// Admins only: downloads the workspace as a JSON file.
export async function GET(_request: Request, context: Context) {
  await connection();
  try {
    const user = await requireUser();
    rateLimit(`workspace-export:${user.id}`, 5, 10 * 60_000);
    const data = await exportWorkspace(user.id, (await context.params).id);
    const name = `synk-${data.workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"}-${data.exportedAt.slice(0, 10)}.json`;
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
