import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

// 入学の手動記録・取り消し。プロフィール行が無い生徒は作成する。
const schema = z.object({
  staffId: z.string().min(1),
  enrolled: z.boolean(),
  enrolledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // 入学日（enrolled=true のとき）
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const { staffId, enrolled, enrolledOn } = body.data;

  const { data: student } = await supabaseAdmin.from("schedule_students").select("id").eq("id", id).maybeSingle();
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const patch = {
    enrollment_status: enrolled ? "enrolled" : "not_enrolled",
    enrolled_at: enrolled ? (enrolledOn ? `${enrolledOn}T00:00:00+09:00` : new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("schedule_student_profiles").upsert({ student_id: id, ...patch }, { onConflict: "student_id" });
  if (error) return dbError(error.message);
  await audit("schedule_student_profiles", id, "update", staffId, patch);
  return NextResponse.json({ ok: true });
}
