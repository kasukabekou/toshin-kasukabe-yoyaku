import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { jstToday } from "@/lib/manage/loaders";
import { APPOINTMENT_KIND_LABELS, fmtTime } from "@/lib/manage/labels";
import { StaffShell } from "@/components/staff/StaffShell";

export const dynamic = "force-dynamic";

const OUTCOME_LABELS: Record<string, string> = { done: "実施済", absent: "欠席", cancelled: "中止" };
const addDay = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00+09:00`).getTime() + n * 86400000 + 9 * 3600000).toISOString().slice(0, 10);

export default async function VisitsPage() {
  const today = jstToday();
  const tomorrow = addDay(today, 1);
  const from = `${today}T00:00:00+09:00`;
  const to = `${addDay(today, 2)}T00:00:00+09:00`;

  const { data: appts, error } = await supabaseAdmin
    .from("schedule_appointments")
    .select("id, student_id, kind, start_at, purpose, assigned_staff_id")
    .eq("status", "booked")
    .eq("is_visit", true)
    .not("student_id", "is", null)
    .gte("start_at", from)
    .lt("start_at", to)
    .order("start_at");
  const ids = [...new Set((appts ?? []).map((a) => a.student_id as string))];
  const apptIds = (appts ?? []).map((a) => a.id as string);
  const [students, staff, outs] = await Promise.all([
    supabaseAdmin.from("schedule_students").select("id, name, school, grade").in("id", ids.length ? ids : ["-"]),
    supabaseAdmin.from("schedule_staff_members").select("id, name"),
    supabaseAdmin.from("schedule_outcomes").select("appointment_id, result").in("appointment_id", apptIds.length ? apptIds : ["-"]),
  ]);
  const studentBy = new Map((students.data ?? []).map((s) => [s.id as string, s]));
  const staffName = new Map((staff.data ?? []).map((s) => [s.id as string, s.name as string]));
  const outcomeBy = new Map((outs.data ?? []).map((o) => [o.appointment_id as string, o.result as string]));
  const jstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);

  const sections = [
    { title: "今日の来校", date: today },
    { title: "明日の来校予定", date: tomorrow },
  ];
  return (
    <StaffShell active="/staff/visits">
      <h1 className="mb-1 text-xl font-semibold text-fg">来校・対応予定</h1>
      <p className="mb-4 text-sm text-mutedfg">今日と明日に来校する生徒です。連絡記録で次回来校日を入れると、ここに表示されます。</p>
      {error && <p className="text-sm text-red-600">読み込みに失敗しました: {error.message}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((sec) => {
          const list = (appts ?? []).filter((a) => jstDate(a.start_at as string) === sec.date);
          return (
            <section key={sec.date}>
              <h2 className="mb-2 text-sm font-semibold text-fg">{sec.title}（{sec.date.slice(5).replace("-", "/")}）・{list.length}名</h2>
              <div className="space-y-2">
                {list.length === 0 && <p className="text-xs text-mutedfg">来校予定はありません。</p>}
                {list.map((a) => {
                  const s = studentBy.get(a.student_id as string);
                  const o = outcomeBy.get(a.id as string);
                  return (
                    <Link key={a.id as string} href={`/staff/students/${a.student_id as string}`} className="block rounded-lg border border-border bg-surface p-3 text-xs hover:bg-subtle">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-fg">{fmtTime(a.start_at as string)} {s?.name as string ?? "不明"}</p>
                        {o && <span className="rounded bg-subtle px-2 py-0.5 text-mutedfg">{OUTCOME_LABELS[o] ?? o}</span>}
                      </div>
                      <p className="mt-0.5 text-mutedfg">
                        {s?.school as string} {s?.grade as string} ・ {APPOINTMENT_KIND_LABELS[a.kind as string] ?? (a.kind as string)}
                        {a.purpose ? ` ・ ${a.purpose as string}` : ""} ・ 担当: {a.assigned_staff_id ? staffName.get(a.assigned_staff_id as string) ?? "不明" : "未設定"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </StaffShell>
  );
}
