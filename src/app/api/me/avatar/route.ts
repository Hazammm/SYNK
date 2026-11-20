import { api, AppError } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_AVATAR_BYTES, removeAvatar, setAvatar } from "@/features/account/avatar";

export async function POST(request: Request) {
  return api(async () => {
    const user = await authorizeWrite(request);
    rateLimit(`avatar:${user.id}`, 10);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES + 64 * 1024) throw new AppError(413, "Choose a photo up to 2 MB.");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new AppError(400, "Choose a photo to upload.");
    return setAvatar(user.id, file);
  });
}

export async function DELETE(request: Request) {
  return api(async () => removeAvatar((await authorizeWrite(request)).id));
}
