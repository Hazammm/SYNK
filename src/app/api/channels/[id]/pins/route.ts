import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listPins } from "@/features/chat/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    return { pins: await listPins(user.id, id) };
  });
}

