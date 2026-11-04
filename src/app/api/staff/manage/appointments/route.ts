import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

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

  if (d.replaceId) {
    // 同じ送信の再処理で旧予約を二重に更新しないよう、booked のものだけ対象にする
    await supabaseAdmin
      .from("schedule_appointments")
      .update({ status: "rescheduled", updated_at: new Date().toISOString() })
      .eq("id", d.replaceId)
      .eq("status", "booked");
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
  if (error) return dbError(error.message);
  await audit("schedule_appointments", id, "insert", d.staffId, { replaceId: d.replaceId ?? null });
  return NextResponse.json({ id });
}
