import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

// イベントの登録。動員の定義は「申込」固定。
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  clientId: z.string().min(1).max(100), // 二重送信防止
  name: z.string().min(1).max(100),
  rawType: z.string().min(1).max(50),
  startsOn: date.nullable().optional(),
  endsOn: date.nullable().optional(),
  countFrom: date.nullable().optional(),
  countTo: date.nullable().optional(),
  mobilizationTarget: z.number().int().min(0).nullable().optional(),
  enrollmentTarget: z.number().int().min(0).nullable().optional(),
  staffId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  const id = `evt_${d.clientId}`;
  const { error } = await supabaseAdmin.from("schedule_events").upsert(
    {
      id,
      name: d.name,
      raw_type: d.rawType,
      starts_on: d.startsOn ?? null,
      ends_on: d.endsOn ?? null,
      count_from: d.countFrom ?? null,
      count_to: d.countTo ?? null,
      mobilization_stage: "applied",
      mobilization_target: d.mobilizationTarget ?? null,
      enrollment_target: d.enrollmentTarget ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) return dbError(error.message);
  await audit("schedule_events", id, "insert", d.staffId);
  return NextResponse.json({ id });
}
