import "server-only";
import { supabaseAdmin } from "@/lib/supabase/adminClient";

export const FAILURE_ALERT_THRESHOLD = 3; // 連続でこの回数失敗したら通知（一時的な失敗では通知しない）
export const STALE_MINUTES = 20; // 最後の成功がこれより古いと「止まっている」と判断

export type FailureKind = "tls" | "auth" | "timeout" | "database" | "other";
export const FAILURE_LABELS: Record<FailureKind, string> = {
  tls: "証明書・暗号化接続のエラー（サーバーの証明書が更新された可能性）",
  auth: "メールサーバーに拒否された（パスワード変更の可能性）",
  timeout: "メールサーバーに接続できない・応答がない",
  database: "データベースへの書き込みに失敗",
  other: "原因不明のエラー",
};

// 原因の「種類」だけに分類する。エラー文にはホスト名などが含まれ得るため、文面そのものは通知・保存しない。
export function classifyFailure(e: unknown): FailureKind {
  const m = e instanceof Error ? `${e.name} ${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
  if (/cert|ssl|tls|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME_MISMATCH/i.test(m)) return "tls";
  if (/POP3 error|-ERR|auth/i.test(m)) return "auth";
  if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|closed/i.test(m)) return "timeout";
  if (/relation|PGRST|supabase|duplicate key|violates|permission denied|db /i.test(m)) return "database";
  return "other";
}

export type Notify = (text: string) => Promise<boolean>;

interface State {
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_kind: string;
  alerted: boolean;
  stale_alerted: boolean;
}
const EMPTY: State = { consecutive_failures: 0, last_success_at: null, last_failure_at: null, last_failure_kind: "", alerted: false, stale_alerted: false };

async function load(): Promise<State> {
  const { data, error } = await supabaseAdmin.from("schedule_mail_poll_state").select("*").eq("id", "main").maybeSingle();
  if (error) throw new Error("state read failed");
  return { ...EMPTY, ...(data as Partial<State> | null) };
}
async function save(s: State): Promise<void> {
  const { error } = await supabaseAdmin.from("schedule_mail_poll_state").upsert({ id: "main", ...s, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error("state write failed");
}

// 状態テーブルが未作成・DB障害でも、取込自体は止めない。記録できなかったことだけをログに残す。
export async function recordPollSuccess(notify: Notify, now: Date = new Date()): Promise<void> {
  try {
    const s = await load();
    if (s.alerted || s.stale_alerted) await notify("✅ 申込メールの自動取込が復旧しました。");
    await save({ ...s, consecutive_failures: 0, last_success_at: now.toISOString(), alerted: false, stale_alerted: false });
  } catch {
    console.error("poll state unavailable");
  }
}

export async function recordPollFailure(kind: FailureKind, notify: Notify, now: Date = new Date()): Promise<void> {
  try {
    const s = await load();
    const failures = s.consecutive_failures + 1;
    let alerted = s.alerted;
    if (failures >= FAILURE_ALERT_THRESHOLD && !alerted) {
      alerted = (await notify(`🚨 申込メールの自動取込が${failures}回連続で失敗しています。\n原因の目安: ${FAILURE_LABELS[kind]}\n新しい申込が登録されていない可能性があります。`)) || alerted;
    }
    await save({ ...s, consecutive_failures: failures, last_failure_at: now.toISOString(), last_failure_kind: kind, alerted });
  } catch {
    console.error("poll state unavailable");
  }
}

// 見張り：定期実行そのものが止まっていないか（最後の成功が古すぎないか）を確認する。
export async function checkStale(notify: Notify, now: Date = new Date()): Promise<{ status: "ok" | "stale" | "unknown"; minutes?: number }> {
  let s: State;
  try {
    s = await load();
  } catch {
    await notify("🚨 メール取込の状態を確認できません（データベースの障害、または状態テーブルが未作成の可能性）。");
    return { status: "unknown" };
  }
  const minutes = s.last_success_at ? Math.floor((now.getTime() - new Date(s.last_success_at).getTime()) / 60000) : Infinity;
  if (minutes <= STALE_MINUTES) return { status: "ok", minutes };
  if (!s.stale_alerted) {
    const sent = await notify(`🚨 申込メールの自動取込が${s.last_success_at ? `${minutes}分間` : "まだ一度も"}成功していません。定期実行（cron-job.org）が止まっている可能性があります。`);
    try {
      await save({ ...s, stale_alerted: sent || s.stale_alerted });
    } catch {
      console.error("poll state unavailable");
    }
  }
  return { status: "stale", minutes: Number.isFinite(minutes) ? minutes : undefined };
}
