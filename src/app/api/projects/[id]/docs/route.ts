import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { createDoc, listDocs } from "@/features/docs/service";
type Context = { params: Promise<{ id: string }> };
// Room for a full page: 100,000 characters can take up to about 400 KB as UTF-8.
const MAX_BODY = 420_000;

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ docs: await listDocs((await requireUser()).id, (await context.params).id) }));
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request, MAX_BODY);
    return { doc: await createDoc(user.id, (await context.params).id, body) };
  }, 201);
}
