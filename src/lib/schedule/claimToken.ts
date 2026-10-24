import "server-only";
import { supabaseAdmin } from "../supabase/adminClient";

// 送信処理の最初にトークンを「未使用のときだけ」使用済みにする（条件付きUPDATE）。
// 連打・リトライで同じトークンの送信が並んでも、1件しか先へ進めない。
export async function claimScheduleToken(token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("schedule_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("id");
  if (error) throw new Error(`token claim failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// 途中で失敗した送信をやり直せるよう、確保したトークンを未使用に戻す。
export async function releaseScheduleToken(token: string): Promise<void> {
  const { error } = await supabaseAdmin.from("schedule_tokens").update({ used_at: null }).eq("token", token);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("token release failed", error);
  }
}
