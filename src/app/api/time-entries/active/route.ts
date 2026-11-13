import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { getActiveTimer } from "@/features/time/service";

export async function GET() {
  // Awaited outside api(): during the build this tells Next.js the route is per-request.
  await connection();
  return api(async () => ({ entry: await getActiveTimer((await requireUser()).id) }));
}
