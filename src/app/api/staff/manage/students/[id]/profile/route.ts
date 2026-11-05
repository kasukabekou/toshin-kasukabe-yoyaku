import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

// 体験生情報（入学の意思・志望校・支援方針）の更新。プロフィール行が無い生徒は作成する。送った項目だけ更新。
const schema = z.object({
  staffId: z.string().min(1),
  intentStatus: z.enum(["unconfirmed", "confirmed", "considering", "declined"]).optional(),
  desiredUniversity: z.string().max(100).optional(),
  desiredFaculty: z.string().max(100).optional(),
  supportPolicy: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const { staffId, ...f } = body.data;

  const { data: student } = await supabaseAdmin.from("schedule_students").select("id").eq("id", id).maybeSingle();
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (f.intentStatus !== undefined) patch.intent_status = f.intentStatus;
  if (f.desiredUniversity !== undefined) patch.desired_university = f.desiredUniversity;
  if (f.desiredFaculty !== undefined) patch.desired_faculty = f.desiredFaculty;
  if (f.supportPolicy !== undefined) patch.support_policy = f.supportPolicy;

  const { error } = await supabaseAdmin.from("schedule_student_profiles").upsert({ student_id: id, ...patch }, { onConflict: "student_id" });
  if (error) return dbError(error.message);
  await audit("schedule_student_profiles", id, "update", staffId, patch);
  return NextResponse.json({ ok: true });
}
