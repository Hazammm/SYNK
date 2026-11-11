import { requireUser } from "./session";
import { assertSameOrigin, readJson } from "./http";
import { rateLimit } from "./rate-limit";

// Every issue-tracking write goes through the same gate: a valid session,
// a same-origin request (CSRF), a per-user rate limit, then a size-capped JSON body.
export async function readWrite(request: Request) {
  return { user: await authorizeWrite(request), body: await readJson(request) };
}

// The same gate for writes that carry no body, such as DELETE.
export async function authorizeWrite(request: Request) {
  const user = await requireUser();
  assertSameOrigin(request);
  rateLimit(`tracker-write:${user.id}`, 120);
  return user;
}
