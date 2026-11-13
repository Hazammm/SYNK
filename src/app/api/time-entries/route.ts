import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listTimeEntries } from "@/features/time/service";

// GET /api/time-entries?projectId=…&from=…&to=…[&userId=…] lists a project's entries in a range.
export async function GET(request: Request) {
  await connection();
  return api(async () => {
    const user = await requireUser();
    return { entries: await listTimeEntries(user.id, Object.fromEntries(new URL(request.url).searchParams)) };
  });
}
