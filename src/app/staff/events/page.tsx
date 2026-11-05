import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { MANAGE_TYPE_LABELS } from "@/lib/manage/labels";
import { StaffShell } from "@/components/staff/StaffShell";
import { DeleteButton } from "@/components/staff/DeleteButton";
import { EventForm } from "./EventForm";

export const dynamic = "force-dynamic";

const jstYmd = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);
const pct = (n: number, target: number | null) => (target ? `${Math.round((n / target) * 100)}%` : "—");

// イベント進捗。申込数＝そのイベントに割り当てた申込、または集計する申込種別でイベント未割当のうち集計期間内に受け付けた申込の生徒数。
// 動員は「申込」で数える。入学数＝その生徒のうち入学済み。目標が未設定の項目は達成率を出さない。
export default async function EventsPage() {
  const [events, enr, enrolled] = await Promise.all([
    supabaseAdmin.from("schedule_events").select("*").order("starts_on", { ascending: false, nullsFirst: false }),
    supabaseAdmin.from("schedule_enrollments").select("student_id, event_id, raw_type, created_at"),
    supabaseAdmin.from("schedule_student_profiles").select("student_id").eq("enrollment_status", "enrolled"),
  ]);
  const error = [events, enr, enrolled].find((r) => r.error)?.error;
  const enrolledIds = new Set((enrolled.data ?? []).map((p) => p.student_id as string));

  const rows = (events.data ?? []).map((e) => {
    const from = e.count_from as string | null;
    const to = e.count_to as string | null;
    const students = new Set<string>();
    for (const r of enr.data ?? []) {
      const assigned = r.event_id === e.id;
      const day = jstYmd(r.created_at as string);
      const byType = !r.event_id && e.raw_type && r.raw_type === e.raw_type && (!from || day >= from) && (!to || day <= to);
      if (assigned || byType) students.add(r.student_id as string);
    }
    const enrolledN = [...students].filter((s) => enrolledIds.has(s)).length;
    return { e, applied: students.size, enrolledN };
  });

  return (
    <StaffShell active="/staff/events">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-fg">イベント進捗</h1>
          <p className="text-sm text-mutedfg">イベントごとの申込数（動員）と入学数を、目標と比べて確認します。</p>
        </div>
        <EventForm />
      </div>
      {error && (
        <p className="mb-3 text-sm text-red-600">読み込みに失敗しました: {error.message}（014のSQLを実行していない場合は、実行してください）</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="bg-subtle text-mutedfg">
            <tr>
              <th className="px-3 py-2">イベント</th>
              <th className="px-3 py-2">開催</th>
              <th className="px-3 py-2">集計する申込</th>
              <th className="px-3 py-2">申込数／目標</th>
              <th className="px-3 py-2">達成率</th>
              <th className="px-3 py-2">入学数／目標</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-mutedfg">イベントが登録されていません。</td></tr>
            )}
            {rows.map(({ e, applied, enrolledN }) => (
              <tr key={e.id as string} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-fg">{e.name as string}</td>
                <td className="px-3 py-2 text-mutedfg">{(e.starts_on as string) ?? "—"}{e.ends_on ? ` 〜 ${e.ends_on as string}` : ""}</td>
                <td className="px-3 py-2 text-mutedfg">
                  {e.raw_type ? MANAGE_TYPE_LABELS[e.raw_type as string] ?? (e.raw_type as string) : "未設定"}
                  {e.count_from || e.count_to ? `（${(e.count_from as string) ?? ""}〜${(e.count_to as string) ?? ""}）` : ""}
                </td>
                <td className="px-3 py-2">{applied}／{(e.mobilization_target as number | null) ?? "—"}</td>
                <td className="px-3 py-2">{pct(applied, e.mobilization_target as number | null)}</td>
                <td className="px-3 py-2">{enrolledN}／{(e.enrollment_target as number | null) ?? "—"}（{pct(enrolledN, e.enrollment_target as number | null)}）</td>
                <td className="px-3 py-2">
                  <DeleteButton description={`「${e.name as string}」を削除します（申込は削除されません）。`} url={`/api/staff/manage/events/${e.id as string}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
