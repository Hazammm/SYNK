import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listThreads } from "@/features/chat/manage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  return api(async () => ({ threads: await listThreads((await requireUser()).id, (await context.params).id) }));
}
