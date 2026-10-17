import { z } from "zod";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { addChannelMember } from "@/features/chat/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const body = z.object({ userId: idSchema }).strict().parse(await readJson(request));
    return addChannelMember(user.id, (await context.params).id, body.userId);
  });
}
