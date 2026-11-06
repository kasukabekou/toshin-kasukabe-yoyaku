import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, isValidSessionCookieValue } from "@/lib/staff/auth";

// 募集管理（申込〜三者面談・イベント進捗などの管理画面とそのAPI）は、各自のPCでのみ使う（STAFF_MANAGEMENT_UI=1 のとき）。
// 公開環境（Vercel）では設定せず、従来どおりのスタッフ画面（ログイン・申込一覧）だけを開く。予約フォーム・メール取込は影響を受けない。
const ALWAYS_OPEN = new Set(["/staff", "/staff/login", "/staff/applications", "/api/staff/login", "/api/staff/logout"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (process.env.STAFF_MANAGEMENT_UI !== "1" && !ALWAYS_OPEN.has(pathname.replace(/\/$/, "") || "/")) {
    return pathname.startsWith("/api/") ? NextResponse.json({ error: "not_found" }, { status: 404 }) : new NextResponse("Not Found", { status: 404 });
  }
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
