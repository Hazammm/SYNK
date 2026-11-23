import { connection } from "next/server";
import { api } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { listScheduled } from "@/features/schedule/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  return api(async () => ({ scheduled: await listScheduled((await requireUser()).id, (await context.params).id) }));
}
