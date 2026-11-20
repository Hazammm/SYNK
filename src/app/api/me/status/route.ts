import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { setStatus } from "@/features/account/service";

// Body { text, emoji, expiresAt, away? }. Empty text and emoji clear the status.
export async function PUT(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { status: await setStatus(user.id, body) };
  });
}
