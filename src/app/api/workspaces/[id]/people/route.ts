import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listPeople } from "@/features/people/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  return api(async () => ({ people: await listPeople((await requireUser()).id, (await context.params).id) }));
}
