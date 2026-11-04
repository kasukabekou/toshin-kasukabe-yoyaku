import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { jstToday, loadIntakeRows } from "@/lib/manage/loaders";
import { StaffShell } from "@/components/staff/StaffShell";
import { DeleteButton } from "@/components/staff/DeleteButton";
import { fmtDateTime } from "@/lib/manage/labels";
import { IntakeBoard } from "./IntakeBoard";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const [{ rows, error }, { data: staff }, { data: review }] = await Promise.all([
    loadIntakeRows(),
    supabaseAdmin.from("schedule_staff_members").select("id, name").eq("active", true).order("sort_order"),
    supabaseAdmin.from("schedule_mail_ingests").select("id, subject, reason, created_at").eq("status", "needs_review").order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <StaffShell active="/staff/intake">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-fg">申込〜初回三者面談</h1>
          <p className="text-sm text-mutedfg">アポイントが取れていない生徒を確認し、連絡・日程化を進めます。</p>
        </div>
        <Link href="/staff/students/new" className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-subtle">
          ＋ 手動登録
        </Link>
      </div>
      {(review ?? []).length > 0 && (
        <details open className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-amber-900">メールの自動取込で読み取れなかった申込通知が{(review ?? []).length}件あります（登録されていません）</summary>
          <div className="mt-2 space-y-2">
            {(review ?? []).map((m) => (
              <div key={m.id as string} className="flex flex-wrap items-start justify-between gap-2 text-amber-900">
                <p>{fmtDateTime(m.created_at as string)} ・ {m.subject as string} ・ {m.reason as string}</p>
                <DeleteButton label="確認済みとして削除" description="この確認待ちを削除します（元のメールは削除されません）。" url={`/api/staff/manage/records/mail-ingests/${m.id as string}`} />
              </div>
            ))}
          </div>
        </details>
      )}
      {error ? (
        <p className="text-sm text-red-600">読み込みに失敗しました: {error}</p>
      ) : (
        <IntakeBoard rows={rows} staff={(staff ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))} today={jstToday()} />
      )}
    </StaffShell>
  );
}
