import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { stopTimer } from "@/features/time/service";

export async function POST(request: Request) {
  return api(async () => ({ entry: await stopTimer((await authorizeWrite(request)).id) }));
}
