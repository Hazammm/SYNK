import { z } from "zod";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { emailSchema } from "@/lib/validation";
import { addMember, listMembers } from "@/features/workspaces/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ members: await listMembers((await requireUser()).id, (await context.params).id) }));
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { email } = z.object({ email: emailSchema }).strict().parse(await readJson(request));
    return addMember(user.id, (await context.params).id, email);
  });
}
