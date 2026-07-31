import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { STAFF_COOKIE_NAME, verifyAccessCode, buildSessionCookieValue } from "@/lib/staff/auth";

const bodySchema = z.object({ code: z.string().min(1).max(64) });

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!verifyAccessCode(parsed.data.code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE_NAME, await buildSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 2週間
  });
  return res;
}
