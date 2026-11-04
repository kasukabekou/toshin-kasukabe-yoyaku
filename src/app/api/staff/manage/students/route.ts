import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

// 手動登録（電話・来校・紹介）。氏名以外は未入力でも仮登録でき、不足は画面で確認できる。
const schema = z.object({
  clientId: z.string().min(1).max(100), // 二重送信防止
  name: z.string().min(1).max(100),
  nameKana: z.string().max(100).default(""),
  school: z.string().max(100).default(""),
  grade: z.string().max(20).default(""),
  email: z.string().max(200).default(""),
  phone: z.string().max(50).default(""),
  rawType: z.string().min(1).max(50),
  channel: z.enum(["phone", "visit", "referral", "mail"]),
  eventId: z.string().nullable().optional(),
  staffId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  const studentId = `stu_${d.clientId}`;

  const { error: sErr } = await supabaseAdmin.from("schedule_students").upsert(
    { id: studentId, name: d.name, name_kana: d.nameKana, school: d.school, grade: d.grade, email: d.email, phone: d.phone },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (sErr) return dbError(sErr.message);
  const { error: eErr } = await supabaseAdmin.from("schedule_enrollments").upsert(
    { id: `enr_${d.clientId}`, student_id: studentId, event_id: d.eventId ?? null, raw_type: d.rawType, channel: d.channel },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (eErr) return dbError(eErr.message);
  await audit("schedule_students", studentId, "insert", d.staffId, { channel: d.channel });
  return NextResponse.json({ studentId });
}
