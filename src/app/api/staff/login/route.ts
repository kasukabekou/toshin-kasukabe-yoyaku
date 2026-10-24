import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { STAFF_COOKIE_NAME, STAFF_SESSION_MAX_AGE_SECONDS, verifyAccessCode, buildSessionCookieValue } from "@/lib/staff/auth";
import { isLoginLocked, recordLoginFailure } from "@/lib/staff/loginThrottle";
import { clientIp } from "@/lib/http/clientIp";

const FAILURE_DELAY_MS = 500; // 失敗時に少し待たせ、連続試行の速度を落とす

const bodySchema = z.object({ code: z.string().min(1).max(64) });

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const ip = clientIp(request.headers);
  if (await isLoginLocked(ip)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  if (!(await verifyAccessCode(parsed.data.code))) {
    await recordLoginFailure(ip);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE_NAME, await buildSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
