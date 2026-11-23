import { connection } from "next/server";
import { api } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { readWrite } from "@/lib/write-request";
import { createReminder, listReminders } from "@/features/reminders/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => ({ reminders: await listReminders((await requireUser()).id, (await context.params).id) }));
}

export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { reminder: await createReminder(user.id, (await context.params).id, body) };
  }, 201);
}
