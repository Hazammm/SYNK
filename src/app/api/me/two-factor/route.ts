import { api } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { readWrite } from "@/lib/write-request";
import { confirmTwoFactor, disableTwoFactor } from "@/features/account/two-factor";

const guessLimit = (userId: string) => rateLimit(`two-factor:${userId}`, 10, 5 * 60_000);

// Body { code }: turns two-factor sign-in on and returns recovery codes once.
export async function POST(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    guessLimit(user.id);
    return confirmTwoFactor(user.id, body);
  });
}

// Body { password, code }: turns two-factor sign-in off.
export async function DELETE(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    guessLimit(user.id);
    return disableTwoFactor(user.id, body);
  });
}
