import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, parseBody, updateWithVersion } from "@/lib/manage/server";

// 担当・期限・内容の変更、完了・中止・再設定。version 必須（同時編集の上書き防止）。
const schema = z.object({
  version: z.number().int(),
  staffId: z.string().nullable().optional(), // 変更者
  content: z.string().min(1).max(500).optional(),
  assignedStaffId: z.string().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["todo", "doing", "done", "cancelled"]).optional(),
  resultNote: z.string().max(1000).optional(),
  closedReason: z.string().max(500).optional(), // 中止・対応不要の理由
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const { version, staffId, ...f } = body.data;

  if (f.status === "cancelled" && !f.closedReason) {
    return NextResponse.json({ error: "invalid_request", message: "中止する場合は理由を入力してください。" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (f.content !== undefined) patch.content = f.content;
  if (f.assignedStaffId !== undefined) patch.assigned_staff_id = f.assignedStaffId;
  if (f.dueOn !== undefined) patch.due_on = f.dueOn;
  if (f.resultNote !== undefined) patch.result_note = f.resultNote;
  if (f.closedReason !== undefined) patch.closed_reason = f.closedReason;
  if (f.status !== undefined) {
    patch.status = f.status;
    const closing = f.status === "done" || f.status === "cancelled";
    patch.completed_at = closing ? new Date().toISOString() : null;
    patch.completed_by = closing ? staffId ?? null : null;
  }

  const r = await updateWithVersion("schedule_tasks", id, version, patch);
  if ("error" in r) return r.error;
  await audit("schedule_tasks", id, "update", staffId, patch);
  return NextResponse.json({ task: r.row });
}
