import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/adminClient";

// Supabase無料プランは7日間APIアクセスがないと自動的に一時停止するため、
// 外部の定期実行（GitHub Actions等）からこのエンドポイントを叩いてアクセスを維持する。
export async function GET() {
  const { error } = await supabaseAdmin.from("schedule_applications").select("id").limit(1);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("health check failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
