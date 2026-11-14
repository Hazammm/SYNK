import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Pages meant only for unauthenticated users (never redirect create-workspace here).
const guestOnlyPages = new Set(["/login", "/forgot-password", "/reset-password"]);

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isJoinPage = pathname.startsWith("/join/");
  const isGoogleCallback = pathname.startsWith("/api/auth/google-profile");
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (isJoinPage || isGoogleCallback) return NextResponse.next();

  // If a user has a token and visits login without an error param, take them to home (which resolves active workspace).
  // If an error is present (e.g. session expired, 401), allow rendering the login page so they aren't trapped in a redirect loop.
  if (guestOnlyPages.has(pathname)) {
    if (token?.sub && !searchParams.has("error")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Allow create-workspace whether authenticated or not (Part B needs it for Google signup too).
  if (pathname === "/create-workspace") {
    return NextResponse.next();
  }

  // All other app routes require authentication.
  if (!token?.sub) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
