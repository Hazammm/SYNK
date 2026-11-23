import { connection } from "next/server";
import { api } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { readWrite } from "@/lib/write-request";
import { createGroup, listGroups } from "@/features/groups/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => ({ groups: await listGroups((await requireUser()).id, (await context.params).id) }));
}

export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { group: await createGroup(user.id, (await context.params).id, body) };
  }, 201);
}
