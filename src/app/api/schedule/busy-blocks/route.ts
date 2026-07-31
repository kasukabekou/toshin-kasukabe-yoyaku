import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { busyBlockFromRow } from "@/lib/schedule/rows";
import { isGoogleCalendarConfigured } from "@/lib/google/calendarClient";
import { fetchGoogleBusyBlocks } from "@/lib/google/busyBlocks";

// 面談担当者の busy 区間の生データを返す。枠計算自体はクライアント側で logic.ts を使って行う。
// Google Calendar（Service Account）が設定されていれば実カレンダーを参照し、未設定ならDBの開発用ダミーデータにフォールバックする。
export async function GET(request: NextRequest) {
  const ownerId = request.nextUrl.searchParams.get("ownerId");
  if (!ownerId) {
    return NextResponse.json({ error: "ownerId is required" }, { status: 400 });
  }

  if (isGoogleCalendarConfigured()) {
    try {
      const timeMin = new Date();
      const timeMax = new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000);
      const busyBlocks = await fetchGoogleBusyBlocks(timeMin, timeMax);
      return NextResponse.json({
        busyBlocks: busyBlocks.map((b, i) => ({ id: `gcal_${i}`, ownerId, startAt: b.startAt, endAt: b.endAt, label: "" })),
        source: "google_calendar",
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "google_calendar_error" }, { status: 500 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("schedule_busy_blocks")
    .select("*")
    .eq("owner_id", ownerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ busyBlocks: (data ?? []).map(busyBlockFromRow), source: "dev_fixture" });
}
