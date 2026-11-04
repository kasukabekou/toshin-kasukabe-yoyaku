import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/adminClient";

// 担当プルダウン用のスタッフ名簿。認証は middleware（/api/staff/*）が担当する。
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("schedule_staff_members")
    .select("id, name")
    .eq("active", true)
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}
