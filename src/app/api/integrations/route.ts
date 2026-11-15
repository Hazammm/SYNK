import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listConnections } from "@/features/integrations/service";

// Which code hosts this server offers, and which the signed-in person has connected.
export async function GET() {
  await connection();
  return api(async () => ({ connections: await listConnections((await requireUser()).id) }));
}
