import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";
import { removeCalendarEvents } from "@/lib/manage/calendarCleanup";

// スタッフによる予定の追加・日程変更。replaceId を指定すると旧予約を「日程変更済」にして新予約と関連づける。
const schema = z.object({
  clientId: z.string().min(1).max(100),
  studentId: z.string().min(1),
  applicationId: z.string().nullable().optional(), // 申込経由の生徒は既存申込に紐づける
  kind: z.string().min(1).max(30), // test | interview | briefing | trial | lecture | call
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  purpose: z.string().max(200).default(""),
  assignedStaffId: z.string().nullable().optional(),
  isVisit: z.boolean().default(true),
  replaceId: z.string().nullable().optional(),
  staffId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  if (new Date(d.endAt) <= new Date(d.startAt)) {
    return NextResponse.json({ error: "invalid_request", message: "終了時刻は開始より後にしてください。" }, { status: 400 });
  }
  const id = `appt_${d.clientId}`;

  // 旧予約を先に「日程変更済」にする（同じ面談を少しずらすとき、旧予約が有効なままだと重複制約に当たるため）。
  // booked のものだけ対象にするので、同じ送信の再処理でも二重に更新しない。
  let oldBooked: { kind: unknown; google_event_id: unknown } | null = null;
  if (d.replaceId) {
    const { data: old } = await supabaseAdmin
      .from("schedule_appointments")
      .update({ status: "rescheduled", updated_at: new Date().toISOString() })
      .eq("id", d.replaceId)
      .eq("status", "booked")
      .select("kind, google_event_id");
    oldBooked = old?.[0] ?? null;
  }
  const { error } = await supabaseAdmin.from("schedule_appointments").upsert(
    {
      id,
      application_id: d.applicationId ?? null,
      student_id: d.studentId,
      kind: d.kind,
      start_at: d.startAt,
      end_at: d.endAt,
      day_index: 0,
      purpose: d.purpose,
      assigned_staff_id: d.assignedStaffId ?? null,
      is_visit: d.isVisit,
      rescheduled_from_id: d.replaceId ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) {
    // 新予約が作れなかったときは旧予約を元に戻す（旧予約だけが「変更済」で消えた状態にしない）
    if (d.replaceId && oldBooked) {
      await supabaseAdmin.from("schedule_appointments").update({ status: "booked" }).eq("id", d.replaceId).eq("status", "rescheduled");
    }
    if (error.code === "23P01") {
      return NextResponse.json({ error: "conflict", message: "その時間には既に別の面談が入っています。" }, { status: 409 });
    }
    return dbError(error.message);
  }
  if (oldBooked) await removeCalendarEvents([oldBooked]);
  await audit("schedule_appointments", id, "insert", d.staffId, { replaceId: d.replaceId ?? null });
  return NextResponse.json({ id });
}
