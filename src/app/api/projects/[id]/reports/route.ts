import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { getProjectReport } from "@/features/reports/service";
type Context = { params: Promise<{ id: string }> };

// GET /api/projects/:id/reports returns the active (or latest) sprint; ?sprintId=… picks another.
export async function GET(request: Request, context: Context) {
  return api(async () => getProjectReport((await requireUser()).id, (await context.params).id, Object.fromEntries(new URL(request.url).searchParams)));
}
