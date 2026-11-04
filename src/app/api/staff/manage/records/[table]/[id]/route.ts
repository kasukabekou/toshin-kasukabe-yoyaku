import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

// 個別の記録の削除（次の対応・連絡記録・実績・予定）。許可したテーブルだけ。
const TABLES: Record<string, string> = {
  tasks: "schedule_tasks",
  "contact-logs": "schedule_contact_logs",
  outcomes: "schedule_outcomes",
  appointments: "schedule_appointments",
  "mail-ingests": "schedule_mail_ingests",
};
const schema = z.object({ staffId: z.string().min(1) });

export async function DELETE(request: Request, { params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  const name = TABLES[table];
  if (!name) return NextResponse.json({ error: "invalid_table" }, { status: 400 });
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;

  if (name === "schedule_appointments") {
    // 予定に紐づく実績と、変更前予約への参照を先に外す
    await supabaseAdmin.from("schedule_outcomes").delete().eq("appointment_id", id);
    await supabaseAdmin.from("schedule_appointments").update({ rescheduled_from_id: null }).eq("rescheduled_from_id", id);
  }
  const { error } = await supabaseAdmin.from(name).delete().eq("id", id);
  if (error) return dbError(error.message);
  await audit(name, id, "delete", body.data.staffId);
  return NextResponse.json({ ok: true });
}
