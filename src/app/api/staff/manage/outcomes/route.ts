import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, createTaskFromRecord, dbError, nextTaskSchema, parseBody } from "@/lib/manage/server";

// 実績（実施済・欠席・中止）。予定とは別に保存し、日時経過だけで実施済にしない。
// appointmentId 省略＝予定なしの当日来校。
const schema = z.object({
  clientId: z.string().min(1).max(100),
  studentId: z.string().min(1),
  appointmentId: z.string().nullable().optional(),
  result: z.enum(["done", "absent", "cancelled"]),
  purpose: z.string().max(200).default(""),
  actualStaffId: z.string().nullable().optional(), // 実際の対応者
  staffId: z.string().nullable().optional(), // 記録者
  occurredAt: z.string().datetime().optional(),
  content: z.string().max(4000).default(""),
  reaction: z.string().max(2000).default(""),
  nextTask: nextTaskSchema.optional(), // 欠席・中止では再調整等の次の対応を同じ画面で設定
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  const id = `out_${d.clientId}`;

  const { error } = await supabaseAdmin.from("schedule_outcomes").upsert(
    {
      id,
      student_id: d.studentId,
      appointment_id: d.appointmentId ?? null,
      result: d.result,
      purpose: d.purpose,
      actual_staff_id: d.actualStaffId ?? null,
      recorded_by: d.staffId ?? null,
      occurred_at: d.occurredAt ?? new Date().toISOString(),
      content: d.content,
      reaction: d.reaction,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) {
    // 同じ予定に別の実績が既にある（unique index）場合
    if (error.code === "23505") {
      return NextResponse.json({ error: "conflict", message: "この予定には既に実績が記録されています。" }, { status: 409 });
    }
    return dbError(error.message);
  }
  await audit("schedule_outcomes", id, "insert", d.staffId, { result: d.result });
  if (d.nextTask) {
    const tErr = await createTaskFromRecord({ studentId: d.studentId, sourceType: "outcome", sourceId: id, task: d.nextTask });
    if (tErr) return dbError(tErr.message);
  }
  return NextResponse.json({ id });
}
