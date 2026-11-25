import "server-only";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit } from "./server";
import { removeCalendarEvents } from "./calendarCleanup";

const inList = (ids: string[]) => (ids.length ? ids : ["-"]);

// 生徒と、その生徒に紐づく記録（申込・予約・連絡・次の対応・実績など）をすべて削除する。元に戻せない。
// 外部キー制約があるため、子 → 親の順に削除する。Googleカレンダーの予定は削除しない（別途手動で削除）。
export async function deleteStudents(ids: string[], staffId: string): Promise<{ deleted: number } | { error: string }> {
  if (ids.length === 0) return { deleted: 0 };

  const { data: students, error: sErr } = await supabaseAdmin.from("schedule_students").select("id, name").in("id", ids);
  if (sErr) return { error: sErr.message };
  const targetIds = (students ?? []).map((s) => s.id as string);
  if (targetIds.length === 0) return { deleted: 0 };

  const { data: apps } = await supabaseAdmin.from("schedule_applications").select("id").in("student_id", targetIds);
  const appIds = (apps ?? []).map((a) => a.id as string);
  const { data: byStudent } = await supabaseAdmin.from("schedule_appointments").select("id").in("student_id", targetIds);
  const { data: byApp } = await supabaseAdmin.from("schedule_appointments").select("id").in("application_id", inList(appIds));
  const apptIds = [...new Set([...(byStudent ?? []), ...(byApp ?? [])].map((a) => a.id as string))];
  // 削除前に、カレンダーの予定を控えておく（削除後は取れない。予定が残って面談枠をふさぎ続けるのを防ぐ）
  const { data: events } = await supabaseAdmin.from("schedule_appointments").select("kind, google_event_id").in("id", inList(apptIds)).not("google_event_id", "is", null);

  // 履歴として、削除した事実（誰が・どの生徒を）を残す
  for (const s of students ?? []) {
    await audit("schedule_students", s.id as string, "delete", staffId, { name: s.name });
  }

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    return error?.message ?? null;
  };

  const sequence: PromiseLike<{ error: { message: string } | null }>[] = [
    supabaseAdmin.from("schedule_outcomes").delete().in("appointment_id", inList(apptIds)),
    supabaseAdmin.from("schedule_outcomes").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_handovers").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_sensitivity_logs").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_study_progress").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_tasks").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_contact_logs").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_student_profiles").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_appointments").update({ rescheduled_from_id: null }).in("rescheduled_from_id", inList(apptIds)),
    supabaseAdmin.from("schedule_appointments").delete().in("id", inList(apptIds)),
    supabaseAdmin.from("schedule_enrollments").delete().in("student_id", targetIds),
    supabaseAdmin.from("schedule_hearing_answers").delete().in("application_id", inList(appIds)),
    supabaseAdmin.from("schedule_pattern_a_answers").delete().in("application_id", inList(appIds)),
    supabaseAdmin.from("schedule_test_subject_selections").delete().in("application_id", inList(appIds)),
    supabaseAdmin.from("schedule_tokens").delete().in("application_id", inList(appIds)),
    supabaseAdmin.from("schedule_applications").delete().in("id", inList(appIds)),
    // メール取込の記録は残す（残さないと同じメールの再取込で生徒が復活する）。生徒への紐づけだけ外す。
    supabaseAdmin.from("schedule_mail_ingests").update({ student_id: null }).in("student_id", targetIds),
    supabaseAdmin.from("schedule_students").update({ merge_candidate_of: null }).in("merge_candidate_of", targetIds),
    supabaseAdmin.from("schedule_students").delete().in("id", targetIds),
  ];
  // supabase のクエリは await した時点で実行されるため、順番に待つ（外部キーの依存順）
  for (const q of sequence) {
    const msg = await run(q);
    if (msg) return { error: msg };
  }
  await removeCalendarEvents(events ?? []);
  return { deleted: targetIds.length };
}
