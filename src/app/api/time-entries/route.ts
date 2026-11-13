import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { addTimeEntry, listTimeEntries } from "@/features/time/service";

// GET /api/time-entries?projectId=…&from=…&to=…[&userId=…] lists a project's entries in a range.
export async function GET(request: Request) {
  await connection();
  return api(async () => {
    const user = await requireUser();
    return { entries: await listTimeEntries(user.id, Object.fromEntries(new URL(request.url).searchParams)) };
  });
}
// Body { ticketId, startedAt, endedAt, note? } adds time worked earlier.
export async function POST(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { entry: await addTimeEntry(user.id, body) };
  }, 201);
}
