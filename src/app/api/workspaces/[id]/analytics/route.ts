import { connection } from "next/server";
import { api } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { workspaceAnalytics } from "@/features/workspaces/admin";

type Context = { params: Promise<{ id: string }> };

// Admins only: members, activity and tickets for the last week and month.
export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => ({ analytics: await workspaceAnalytics((await requireUser()).id, (await context.params).id) }));
}
