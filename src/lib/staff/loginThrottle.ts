import "server-only";
import { supabaseAdmin } from "../supabase/adminClient";
import { generateId } from "../schedule/token";

// 共有アクセスコードの総当たり対策。同じIPからの失敗が続いたら一定時間ログインを受け付けない。
const WINDOW_MS = 1000 * 60 * 15; // 15分
const MAX_FAILURES = 5;
const TABLE = "schedule_staff_login_failures";

// 記録テーブル（supabase/006）が未適用・DB障害のときは、スタッフがログインできなくなるのを避けるため制限しない。
export async function isLoginLocked(ip: string, now: number = Date.now()): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", new Date(now - WINDOW_MS).toISOString());
  if (error) {
    // eslint-disable-next-line no-console
    console.error("login throttle check failed", error);
    return false;
  }
  return (count ?? 0) >= MAX_FAILURES;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).insert({ id: generateId("lf"), ip_address: ip });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("login failure record failed", error);
  }
}
