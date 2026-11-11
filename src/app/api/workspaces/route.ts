import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { createWorkspaceForAdmin, createWorkspaceForGoogleUser } from "@/features/workspaces/onboarding";
import { listWorkspaces } from "@/features/workspaces/service";
import { rateLimit } from "@/lib/rate-limit";
import { readGoogleProfileCookie, clearGoogleProfileCookieHeader } from "@/lib/google-profile-cookie";
import { AppError } from "@/lib/errors";
import { createWorkspaceGoogleSchema, createWorkspaceSchema } from "@/lib/validation";

export async function GET() { return api(async () => ({ workspaces: await listWorkspaces((await requireUser()).id) })); }
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const body = await readJson(request);
    const bodyFields: Record<string, unknown> = typeof body === "object" && body !== null
      ? body as Record<string, unknown>
      : {};
    const isGoogleSignup = !("adminName" in bodyFields) && !("email" in bodyFields) && !("password" in bodyFields);
    const googleProfile = isGoogleSignup ? await readGoogleProfileCookie() : null;

    if (isGoogleSignup && !googleProfile) {
      throw new AppError(401, "Your Google sign-up session expired. Please sign in with Google again.");
    }

    const validBody = isGoogleSignup
      ? createWorkspaceGoogleSchema.safeParse(body).success
      : createWorkspaceSchema.safeParse(body).success;
    if (validBody) {
      const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
      rateLimit(`create-workspace-valid-ip:${clientIp}`, 20, 15 * 60_000);
      const submittedEmail = isGoogleSignup
        ? googleProfile?.email
        : typeof bodyFields.email === "string" ? bodyFields.email.trim().toLowerCase() : undefined;
      if (submittedEmail) rateLimit(`create-workspace-valid-email:${submittedEmail}`, 5, 15 * 60_000);
    }

    if (isGoogleSignup) {
      if (!googleProfile) throw new AppError(401, "Your Google sign-up session expired. Please sign in with Google again.");
      const result = await createWorkspaceForGoogleUser(googleProfile, body);
      // Clear the pending cookie in the response.
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": clearGoogleProfileCookieHeader(),
        },
      });
    }

    return createWorkspaceForAdmin(body);
  }, 201);
}
