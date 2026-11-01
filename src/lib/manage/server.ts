import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { generateId } from "@/lib/schedule/token";

export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 }) } as const;
  }
  return { data: parsed.data as z.infer<T> } as const;
}

export function dbError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

// 変更者・変更内容の記録。監査ログの失敗で本処理は止めない。
export async function audit(table: string, recordId: string, action: "insert" | "update" | "delete", staffId: string | null | undefined, diff?: unknown) {
  await supabaseAdmin.from("schedule_audit_log").insert({
    id: generateId("aud"),
    table_name: table,
    record_id: recordId,
    action,
    staff_id: staffId ?? null,
    diff: diff ?? null,
  });
}

// 楽観ロック：読んだ時点の version と一致するときだけ更新する。不一致は 409（他のスタッフの更新を無言で上書きしない）。
export async function updateWithVersion(table: string, id: string, version: number, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ ...patch, version: version + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("version", version)
    .select("*");
  if (error) return { error: dbError(error.message) } as const;
  if (!data || data.length === 0) {
    return { error: NextResponse.json({ error: "conflict", message: "他のスタッフが先に更新しました。画面を更新して再度操作してください。" }, { status: 409 }) } as const;
  }
  return { row: data[0] as Record<string, unknown> } as const;
}

export const nextTaskSchema = z.object({
  content: z.string().min(1).max(500),
  assignedStaffId: z.string().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// 記録（連絡記録・実績）から次の対応を作る。dedupe_key が同じなら重複作成しない。
export async function createTaskFromRecord(opts: {
  studentId: string;
  enrollmentId?: string | null;
  sourceType: "contact_log" | "outcome" | "manual";
  sourceId: string;
  task: z.infer<typeof nextTaskSchema>;
}) {
  const { error } = await supabaseAdmin.from("schedule_tasks").upsert(
    {
      id: generateId("task"),
      student_id: opts.studentId,
      enrollment_id: opts.enrollmentId ?? null,
      content: opts.task.content,
      assigned_staff_id: opts.task.assignedStaffId ?? null,
      due_on: opts.task.dueOn ?? null,
      source_type: opts.sourceType,
      source_id: opts.sourceId,
      dedupe_key: `${opts.sourceType}:${opts.sourceId}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  );
  return error;
}
