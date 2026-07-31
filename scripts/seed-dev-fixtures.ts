// 開発確認用の固定データをSupabaseに投入するスクリプト。
// 実行: npm run seed:dev（.env.local の NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を使用）
// 投入されるのは開発用の申込2件（パターンC/B）とトークン、星野の busy ブロックのみ。本番データには影響しない。
import { createClient } from "@supabase/supabase-js";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // .env.local が無い場合はOS環境変数のみで続行（下のチェックで分かりやすいエラーを出す）
}

// 社内プロキシ経由でないと外部にアクセスできない開発機向け（Node標準fetchはプロキシ環境変数を自動で見ないため）
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。");
  console.error("このリポジトリ直下に .env.local を作成し、.env.example を参考に値を設定してください。");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function iso(daysFromToday: number, hour: number, min: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

async function main() {
  const now = iso(0, 9, 0);
  const expires = iso(30, 0, 0);

  const { error: appError } = await supabase.from("schedule_applications").upsert([
    {
      id: "app_dev_c", pattern: "C", raw_type: "special_invite",
      name: "生徒G（開発用）", name_kana: "セイトジー", school: "サンプル南高校", grade: "高3",
      email: "dev-c@example.com", phone: "090-0000-0001", relation: "self",
      grade_group: "g3", arrival_constraint_note: null, created_at: now,
    },
    {
      id: "app_dev_b", pattern: "B", raw_type: "briefing",
      name: "生徒H（開発用）", name_kana: "セイトエイチ", school: "サンプル北高校", grade: "高2",
      email: "dev-b@example.com", phone: "090-0000-0002", relation: "parent",
      grade_group: null, arrival_constraint_note: null, created_at: now,
    },
  ]);
  if (appError) throw appError;

  const { error: tokenError } = await supabase.from("schedule_tokens").upsert([
    { id: "tok_dev_c", application_id: "app_dev_c", token: "dev-c-token", expires_at: expires, used_at: null },
    { id: "tok_dev_b", application_id: "app_dev_b", token: "dev-b-token", expires_at: expires, used_at: null },
  ]);
  if (tokenError) throw tokenError;

  const { error: busyError } = await supabase.from("schedule_busy_blocks").upsert([
    { id: "bb_1", owner_id: "usr_aoki", start_at: iso(1, 13, 0), end_at: iso(1, 21, 30), label: "終日：校舎長業務" },
    { id: "bb_2", owner_id: "usr_aoki", start_at: iso(2, 13, 0), end_at: iso(2, 16, 0), label: "午後：来客対応" },
    { id: "bb_3", owner_id: "usr_aoki", start_at: iso(3, 18, 0), end_at: iso(3, 19, 30), label: "会議" },
    { id: "bb_4", owner_id: "usr_aoki", start_at: iso(4, 13, 0), end_at: iso(4, 15, 0), label: "研修" },
    { id: "bb_5", owner_id: "usr_aoki", start_at: iso(6, 10, 0), end_at: iso(6, 12, 0), label: "土曜午前：全体会議" },
  ]);
  if (busyError) throw busyError;

  console.log("開発用フィクスチャを投入しました:");
  console.log("  /schedule/dev-c-token （パターンC）");
  console.log("  /schedule/dev-b-token （パターンB）");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
