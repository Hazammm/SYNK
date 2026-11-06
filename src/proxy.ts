import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const authPages = new Set(["/login", "/create-workspace"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isJoinPage = pathname.startsWith("/join/");
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (isJoinPage) return NextResponse.next();
  if (authPages.has(pathname)) {
    return token?.sub ? NextResponse.redirect(new URL("/overview", request.url)) : NextResponse.next();
  }
  if (!token?.sub) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
