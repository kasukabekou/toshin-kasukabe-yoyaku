import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { fmtDateTime, MANAGE_TYPE_LABELS } from "@/lib/manage/labels";
import { StaffShell } from "@/components/staff/StaffShell";
import { AttackRow, type AttackItem } from "./AttackRow";

export const dynamic = "force-dynamic";

const TRIAL_TYPES = ["trial_day", "week_intensive_trial", "common_test_trial"];

// 体験済み＝体験の予定(kind=trial)に実施済の実績がある、または体験系の申込で何らかの実施済の実績がある。
// 対象＝体験済み・未入学・連絡可・入学意思が辞退でない。未連絡・連絡が古い順に並べる。
export default async function AttackPage() {
  const [outs, appts, enr, profiles, students, logs, tasks] = await Promise.all([
    supabaseAdmin.from("schedule_outcomes").select("student_id, appointment_id, occurred_at").eq("result", "done"),
    supabaseAdmin.from("schedule_appointments").select("id, kind"),
    supabaseAdmin.from("schedule_enrollments").select("student_id, raw_type, created_at").order("created_at", { ascending: false }),
    supabaseAdmin.from("schedule_student_profiles").select("*"),
    supabaseAdmin.from("schedule_students").select("id, name, school, grade"),
    supabaseAdmin.from("schedule_contact_logs").select("student_id, contacted_at").order("contacted_at", { ascending: false }),
    supabaseAdmin.from("schedule_tasks").select("student_id, content").in("status", ["todo", "doing"]).order("created_at", { ascending: false }),
  ]);
  const error = [outs, appts, enr, profiles, students, logs, tasks].find((r) => r.error)?.error;

  const kindBy = new Map((appts.data ?? []).map((a) => [a.id as string, a.kind as string]));
  const rawBy = new Map<string, string>();
  for (const e of enr.data ?? []) if (!rawBy.has(e.student_id as string)) rawBy.set(e.student_id as string, e.raw_type as string);
  const profileBy = new Map((profiles.data ?? []).map((p) => [p.student_id as string, p]));
  const lastLog = new Map<string, string>();
  for (const l of logs.data ?? []) if (!lastLog.has(l.student_id as string)) lastLog.set(l.student_id as string, l.contacted_at as string);
  const taskBy = new Map<string, string>();
  for (const t of tasks.data ?? []) if (!taskBy.has(t.student_id as string)) taskBy.set(t.student_id as string, t.content as string);

  // 生徒ごとの最新の体験実施日
  const trialAt = new Map<string, string>();
  for (const o of outs.data ?? []) {
    const sid = o.student_id as string;
    const isTrial = (o.appointment_id && kindBy.get(o.appointment_id as string) === "trial") || TRIAL_TYPES.includes(rawBy.get(sid) ?? "");
    if (!isTrial) continue;
    const at = o.occurred_at as string;
    if (!trialAt.has(sid) || at > trialAt.get(sid)!) trialAt.set(sid, at);
  }

  const items: (AttackItem & { sortKey: string })[] = (students.data ?? [])
    .filter((s) => {
      const p = profileBy.get(s.id as string);
      return trialAt.has(s.id as string) && p?.enrollment_status !== "enrolled" && p?.contact_ok !== false && p?.intent_status !== "declined";
    })
    .map((s) => {
      const sid = s.id as string;
      const p = profileBy.get(sid);
      const lc = lastLog.get(sid);
      return {
        studentId: sid,
        name: s.name as string,
        school: (s.school as string) ?? "",
        grade: (s.grade as string) ?? "",
        trialLabel: MANAGE_TYPE_LABELS[rawBy.get(sid) ?? ""] ?? "体験",
        trialAt: fmtDateTime(trialAt.get(sid)!),
        lastContact: lc ? fmtDateTime(lc) : "",
        intent: (p?.intent_status as string) ?? "unconfirmed",
        university: (p?.desired_university as string) ?? "",
        faculty: (p?.desired_faculty as string) ?? "",
        policy: (p?.support_policy as string) ?? "",
        openTask: taskBy.get(sid) ?? "",
        sortKey: lc ?? "", // 未連絡が先頭、次に連絡が古い順
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <StaffShell active="/staff/attack">
      <h1 className="mb-1 text-xl font-semibold text-fg">体験生アタックリスト</h1>
      <p className="mb-4 text-sm text-mutedfg">
        体験済み・未入学・連絡可の生徒です（入学意思が「辞退」は除く）。未連絡・連絡が古い順に並びます。連絡を記録するときに次回来校日を入れると、来校・対応予定に載ります。
      </p>
      {error && <p className="text-sm text-red-600">読み込みに失敗しました: {error.message}</p>}
      <div className="space-y-2">
        {items.length === 0 && !error && <p className="text-xs text-mutedfg">対象の生徒はいません。</p>}
        {items.map(({ sortKey, ...item }) => {
          void sortKey;
          return <AttackRow key={item.studentId} item={item} />;
        })}
      </div>
      <p className="mt-3 text-xs text-mutedfg">{items.length}名</p>
    </StaffShell>
  );
}
