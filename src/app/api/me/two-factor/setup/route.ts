import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { startTwoFactor } from "@/features/account/two-factor";

// Starts setup: returns a new secret for an authenticator app. Two-factor stays off until it is confirmed.
export async function POST(request: Request) {
  return api(async () => {
    const { user } = await readWrite(request);
    return startTwoFactor(user.id);
  });
}
