import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit, dbError, parseBody } from "@/lib/manage/server";

// イベントの削除。申込（schedule_enrollments）は消さず、イベントとの紐づけだけ外す。
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(request, z.object({ staffId: z.string().min(1) }));
  if ("error" in body) return body.error;
  const unlink = await supabaseAdmin.from("schedule_enrollments").update({ event_id: null }).eq("event_id", id);
  if (unlink.error) return dbError(unlink.error.message);
  const { error } = await supabaseAdmin.from("schedule_events").delete().eq("id", id);
  if (error) return dbError(error.message);
  await audit("schedule_events", id, "delete", body.data.staffId);
  return NextResponse.json({ ok: true });
}
