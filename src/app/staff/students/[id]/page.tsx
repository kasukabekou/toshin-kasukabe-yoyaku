import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { CONTACT_RESULT_LABELS, fmtDateTime } from "@/lib/manage/labels";
import { StaffShell } from "@/components/staff/StaffShell";
import { ContactForm } from "../../intake/ContactForm";
import { DeleteButton } from "@/components/staff/DeleteButton";
import { TaskRow } from "./TaskRow";
import { AppointmentRow } from "./AppointmentRow";
import { EnrollmentPanel } from "./EnrollmentPanel";

export const dynamic = "force-dynamic";

const OUTCOME_LABELS: Record<string, string> = { done: "実施済", absent: "欠席", cancelled: "中止" };

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: student } = await supabaseAdmin.from("schedule_students").select("*").eq("id", id).maybeSingle();
  if (!student) notFound();

  const [logs, tasks, appts, outs, staff, profile] = await Promise.all([
    supabaseAdmin.from("schedule_contact_logs").select("*").eq("student_id", id).order("contacted_at", { ascending: false }),
    supabaseAdmin.from("schedule_tasks").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("schedule_appointments").select("*").eq("student_id", id).order("start_at"),
    supabaseAdmin.from("schedule_outcomes").select("*").eq("student_id", id).order("occurred_at", { ascending: false }),
    supabaseAdmin.from("schedule_staff_members").select("id, name"),
    supabaseAdmin.from("schedule_student_profiles").select("enrollment_status, enrolled_at").eq("student_id", id).maybeSingle(),
  ]);
  const staffName = new Map((staff.data ?? []).map((s) => [s.id as string, s.name as string]));
  const who = (sid: unknown) => (sid ? staffName.get(sid as string) ?? "不明" : "未設定");
  const outcomeByAppt = new Map((outs.data ?? []).filter((o) => o.appointment_id).map((o) => [o.appointment_id as string, o]));
  const missing = [
    !student.name_kana && "ふりがな", !student.school && "学校", !student.grade && "学年", !student.email && "メール", !student.phone && "電話",
  ].filter(Boolean);

  return (
    <StaffShell active="/staff/intake">
      <div className="mx-auto max-w-4xl">
      <Link href="/staff/intake" className="text-xs text-primary hover:underline">← 申込〜初回三者面談に戻る</Link>

      <div className="mt-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-fg">
          {student.name} <span className="ml-2 text-xs font-normal text-mutedfg">{student.name_kana}</span>
        </h1>
        <p className="mt-1 text-xs text-mutedfg">
          {student.school} {student.grade} ・ {student.email} ・ {student.phone} ・ 主担当: {who(student.primary_staff_id)}
        </p>
        {missing.length > 0 && <p className="mt-1 text-xs text-amber-700">未入力: {missing.join("、")}</p>}
        <EnrollmentPanel studentId={id} enrolledAt={profile.data?.enrollment_status === "enrolled" ? (profile.data.enrolled_at as string | null) ?? new Date().toISOString() : null} />
        <div className="mt-3">
          <DeleteButton
            label="この生徒を削除"
            description={`「${student.name}」と、申込・予約・連絡・次の対応・実績をすべて削除します。Googleカレンダーの予定は削除されません。`}
            url="/api/staff/manage/students/bulk-delete"
            method="POST"
            extraBody={{ ids: [id] }}
            afterHref="/staff/intake"
          />
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">次の対応</h2>
        </div>
        <div className="space-y-2">
          {(tasks.data ?? []).length === 0 && <p className="text-xs text-mutedfg">まだありません。</p>}
          {(tasks.data ?? []).map((t) => (
            <TaskRow
              key={t.id as string}
              task={{
                id: t.id as string, content: t.content as string, status: t.status as string,
                assignedStaffId: (t.assigned_staff_id as string | null) ?? null,
                dueOn: (t.due_on as string | null) ?? null, version: t.version as number,
                closedReason: (t.closed_reason as string) ?? "",
              }}
            />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-fg">予定と実績</h2>
        <div className="space-y-2">
          {(appts.data ?? []).length === 0 && <p className="text-xs text-mutedfg">予定はありません。</p>}
          {(appts.data ?? []).map((a) => {
            const o = outcomeByAppt.get(a.id as string);
            return (
              <AppointmentRow
                key={a.id as string}
                studentId={id}
                appt={{
                  id: a.id as string, kind: a.kind as string, label: `${fmtDateTime(a.start_at as string)}`,
                  purpose: (a.purpose as string) ?? "", status: a.status as string,
                  assignedStaffId: (a.assigned_staff_id as string | null) ?? null, version: a.version as number,
                }}
                outcomeLabel={o ? `${OUTCOME_LABELS[o.result as string]}（${who(o.actual_staff_id)}）` : null}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-sm font-semibold text-fg">連絡履歴</h2>
          <ContactForm studentId={id} />
        </div>
        <div className="space-y-1.5 text-xs">
          {(logs.data ?? []).length === 0 && <p className="text-mutedfg">まだ連絡記録がありません。</p>}
          {(logs.data ?? []).map((l) => (
            <div key={l.id as string} className="flex flex-wrap items-start gap-2 text-mutedfg">
              <p>
              {fmtDateTime(l.contacted_at as string)} ・ {CONTACT_RESULT_LABELS[l.result as string]} ・ {who(l.staff_id)}
              {l.content ? ` ・ ${l.content as string}` : ""}
            </p>
              <DeleteButton description="この連絡記録を削除します。" url={`/api/staff/manage/records/contact-logs/${l.id as string}`} />
            </div>
          ))}
        </div>
      </section>
      </div>
    </StaffShell>
  );
}
