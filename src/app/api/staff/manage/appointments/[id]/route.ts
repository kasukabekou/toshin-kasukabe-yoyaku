import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, parseBody, updateWithVersion } from "@/lib/manage/server";

// 予定担当の設定・取消。日程変更は POST /appointments（新予約を作り、旧予約は「日程変更済」で残す）。
const schema = z.object({
  version: z.number().int(),
  staffId: z.string().nullable().optional(),
  assignedStaffId: z.string().nullable().optional(),
  purpose: z.string().max(200).optional(),
  status: z.literal("cancelled").optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const { version, staffId, ...f } = body.data;
  const patch: Record<string, unknown> = {};
  if (f.assignedStaffId !== undefined) patch.assigned_staff_id = f.assignedStaffId;
  if (f.purpose !== undefined) patch.purpose = f.purpose;
  if (f.status) patch.status = f.status;
  const r = await updateWithVersion("schedule_appointments", id, version, patch);
  if ("error" in r) return r.error;
  await audit("schedule_appointments", id, "update", staffId, patch);
  return NextResponse.json({ appointment: r.row });
}
