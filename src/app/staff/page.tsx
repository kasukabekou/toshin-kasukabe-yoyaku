import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { applicationFromRow } from "@/lib/schedule/rows";
import { SUBJECT_LABELS, RAW_TYPE_LABELS } from "@/lib/booking/logic";
import type { SubjectKey } from "@/lib/types";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

const HEARING_LABELS = [
  "①申し込みのきっかけ・理由",
  "②現在の進路",
  "③志望大学のランク帯",
  "④得意科目分野・苦手科目分野",
  "⑤部活動と活動頻度",
  "⑥直近模試・定期テストの成績",
  "⑦受験勉強を進める上での悩み・課題",
  "⑧招待講習・体験・個別指導を受ける上で相談したいこと",
  "⑨特記事項・校舎に伝えておきたいこと",
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function StaffPage() {
  const { data: appRows, error: appError } = await supabaseAdmin
    .from("schedule_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (appError) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-red-600">読み込みに失敗しました: {appError.message}</main>;
  }

  const applications = (appRows ?? []).map(applicationFromRow);
  const ids = applications.map((a) => a.id);

  const [{ data: hearingRows }, { data: subjectRows }, { data: apptRows }] = await Promise.all([
    supabaseAdmin.from("schedule_hearing_answers").select("*").in("application_id", ids.length ? ids : ["-"]),
    supabaseAdmin.from("schedule_test_subject_selections").select("*").in("application_id", ids.length ? ids : ["-"]).order("subject_order"),
    supabaseAdmin.from("schedule_appointments").select("*").in("application_id", ids.length ? ids : ["-"]).order("start_at"),
  ]);

  const hearingByApp = new Map((hearingRows ?? []).map((r) => [r.application_id as string, r]));
  const subjectsByApp = new Map<string, string[]>();
  for (const row of subjectRows ?? []) {
    const list = subjectsByApp.get(row.application_id as string) ?? [];
    list.push(row.subject_key as string);
    subjectsByApp.set(row.application_id as string, list);
  }
  const appointmentsByApp = new Map<string, { kind: string; startAt: string; endAt: string; dayIndex: number }[]>();
  for (const row of apptRows ?? []) {
    const list = appointmentsByApp.get(row.application_id as string) ?? [];
    list.push({ kind: row.kind as string, startAt: row.start_at as string, endAt: row.end_at as string, dayIndex: row.day_index as number });
    appointmentsByApp.set(row.application_id as string, list);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">申込一覧</h1>
          <p className="text-sm text-mutedfg">新しい順に表示（最大100件）</p>
        </div>
        <LogoutButton />
      </div>

      {applications.length === 0 && <p className="text-sm text-mutedfg">まだ申込がありません。</p>}

      <div className="space-y-4">
        {applications.map((app) => {
          const hearing = hearingByApp.get(app.id);
          const subjects = subjectsByApp.get(app.id) ?? [];
          const appointments = appointmentsByApp.get(app.id) ?? [];
          const testAppointments = appointments.filter((a) => a.kind === "test");
          const interview = appointments.find((a) => a.kind === "interview");

          return (
            <div key={app.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-fg">{app.name}</span>
                  <span className="ml-2 text-xs text-mutedfg">{app.nameKana}</span>
                  <span className="ml-3 rounded bg-subtle px-2 py-0.5 text-xs text-mutedfg">
                    パターン{app.pattern} ・ {RAW_TYPE_LABELS[app.rawType] ?? app.rawType}
                  </span>
                </div>
                <span className="text-xs text-mutedfg">{formatDateTime(app.createdAt)} 受付</span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-mutedfg sm:grid-cols-4">
                <span>{app.school} / {app.grade}</span>
                <span>続柄: {app.relation === "self" ? "本人" : app.relation === "parent" ? "保護者" : "その他"}</span>
                <span>{app.email}</span>
                <span>{app.phone}</span>
              </div>

              {(testAppointments.length > 0 || interview) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {testAppointments.map((t, i) => (
                    <span key={i} className="rounded bg-primary/10 px-2 py-1 text-primary">
                      学診テスト({t.dayIndex + 1}日目): {formatDateTime(t.startAt)}〜{new Date(t.endAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ))}
                  {interview && (
                    <span className="rounded bg-green-600/10 px-2 py-1 text-green-700">
                      面談: {formatDateTime(interview.startAt)}〜{new Date(interview.endAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              )}

              {subjects.length > 0 && (
                <p className="mt-2 text-xs text-mutedfg">
                  受験科目: {subjects.map((s) => SUBJECT_LABELS[s as SubjectKey] ?? s).join("・")}
                </p>
              )}

              {hearing && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-primary">ヒアリング回答を見る</summary>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    {HEARING_LABELS.map((label, i) => {
                      const key = `item${i + 1}` as keyof typeof hearing;
                      const value = (hearing[key] as string) ?? "";
                      if (!value) return null;
                      return (
                        <div key={i}>
                          <dt className="font-medium text-fg">{label}</dt>
                          <dd className="whitespace-pre-wrap text-mutedfg">{value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
