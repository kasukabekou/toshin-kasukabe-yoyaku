import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, isValidSessionCookieValue } from "@/lib/staff/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === "/staff/login" || pathname === "/api/staff/login";
  if (isLoginRoute) return NextResponse.next();

  const cookie = request.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!(await isValidSessionCookieValue(cookie))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/staff/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*", "/api/staff/:path*"],
};
