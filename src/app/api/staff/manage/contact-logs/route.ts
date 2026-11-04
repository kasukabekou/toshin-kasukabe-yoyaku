import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, createTaskFromRecord, dbError, nextTaskSchema, parseBody } from "@/lib/manage/server";

const schema = z.object({
  clientId: z.string().min(1).max(100), // 同じ送信を再処理しても連絡記録・次の対応が増えない
  studentId: z.string().min(1),
  channel: z.enum(["phone", "mail", "line", "visit"]).default("phone"),
  result: z.enum(["no_answer", "connected", "callback_wait", "other"]),
  contactedAt: z.string().datetime().optional(),
  staffId: z.string().nullable().optional(), // 記録者（プルダウン）
  content: z.string().max(2000).default(""),
  nextTask: nextTaskSchema.optional(),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  const id = `cl_${d.clientId}`;

  const { error } = await supabaseAdmin.from("schedule_contact_logs").upsert(
    {
      id,
      student_id: d.studentId,
      channel: d.channel,
      result: d.result,
      contacted_at: d.contactedAt ?? new Date().toISOString(),
      staff_id: d.staffId ?? null,
      content: d.content,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) return dbError(error.message);
  await audit("schedule_contact_logs", id, "insert", d.staffId);

  if (d.nextTask) {
    const tErr = await createTaskFromRecord({ studentId: d.studentId, sourceType: "contact_log", sourceId: id, task: d.nextTask });
    if (tErr) return dbError(tErr.message);
  }
  return NextResponse.json({ id });
}
