import { NextResponse } from "next/server";
import { STAFF_COOKIE_NAME } from "@/lib/staff/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_COOKIE_NAME);
  return res;
}
