// 申込通知メール（東進の申込システムから校舎宛に届くメール）の解析。純粋関数。
// 形式は2種類：
//  A) 「[登録] 東進ハイスクール お申込み(...) 春日部校」 … 「項目 = 値」形式。webID が申込ごとに一意。
//  B) 「…登録完了のお知らせ」（申込システムの別系統の送信元）… 「項目 : 値」形式。受験番号が一意。全国統一高校生テスト・共通テスト体験受験。
// 読み取れない項目は推測で埋めず、missing に列挙する（スタッフが後から確認できる）。

export type MailRawType =
  | "special_invite" | "document_request" | "briefing" | "school_course_briefing" | "open_class"
  | "trial_day" | "week_intensive_trial" | "national_test" | "common_test_trial";

export interface ParsedApplicationMail {
  sourceKey: string; // 重複取込の防止キー（同じ通知を2回処理しても1件）
  format: "web_form" | "exam_notice";
  rawType: MailRawType;
  eventLabel: string; // 例: 冬期特別招待講習 / 全国統一高校生テスト(高1生部門)
  name: string;
  nameKana: string;
  school: string;
  grade: string; // 例: 高2 / 中3 / 空=不明
  email: string;
  phone: string;
  relation: "self" | "parent" | "other" | "";
  gender: string;
  birthDate: string;
  postalCode: string;
  address: string;
  comment: string; // 連絡事項・希望資料など、スタッフが読む自由記述
  submittedAt: string | null; // JST の ISO（+09:00）
  missing: string[];
}

export type ParseResult = { ok: true; data: ParsedApplicationMail } | { ok: false; reason: string };

const nfkc = (s: string) => s.normalize("NFKC");
const clean = (s: string | undefined) => (s ?? "").replace(/[　\s]+/g, " ").trim();

function normalizeBody(body: string): string[] {
  return body.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
}

// 「キー = 値」「キー : 値」を、最初に出た1件だけ採用して辞書にする
function keyValues(lines: string[], sep: RegExp): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of lines) {
    const hit = line.match(sep);
    if (!hit) continue;
    const key = nfkc(hit[1]).replace(/\s/g, "");
    if (key && !m.has(key)) m.set(key, clean(hit[2]));
  }
  return m;
}

function detectType(subject: string, hope: string): { rawType: MailRawType; eventLabel: string } | null {
  const text = nfkc(`${subject} ${hope}`);
  const label = (re: RegExp) => text.match(re)?.[1] ?? "";
  if (/全国統一高校生テスト/.test(text)) return { rawType: "national_test", eventLabel: text.match(/全国統一高校生テスト(\([^)]*\))?/)?.[0] ?? "全国統一高校生テスト" };
  if (/共通テスト体験受験/.test(text)) return { rawType: "common_test_trial", eventLabel: "共通テスト体験受験" };
  if (/高校対応別指導コース/.test(text)) return { rawType: "school_course_briefing", eventLabel: "高校対応別指導コース個別説明会" };
  if (/特別公開授業/.test(text)) return { rawType: "open_class", eventLabel: "特別公開授業" };
  if (/個別説明会/.test(text)) return { rawType: "briefing", eventLabel: "個別説明会" };
  if (/招待講習|招待状請求/.test(text)) return { rawType: "special_invite", eventLabel: label(/\(([^)]*招待講習)\)/) || "特別招待講習" };
  if (/資料請求/.test(text)) return { rawType: "document_request", eventLabel: "資料請求" };
  if (/1週間集中体験|週間集中/.test(text)) return { rawType: "week_intensive_trial", eventLabel: "1週間集中体験" };
  if (/1日体験|一日体験/.test(text)) return { rawType: "trial_day", eventLabel: "1日体験" };
  return null;
}

export function normalizeGrade(rawGrade: string, stage: string): string {
  const g = nfkc(rawGrade);
  const prefix = /中学/.test(nfkc(stage)) ? "中" : /^中/.test(g) ? "中" : "高";
  const direct = g.match(/^[高中]\s*([1-3])/); // 「高3」形式
  if (direct) return `${g[0]}${direct[1]}`;
  const current = g.match(/現\s*([1-3])\s*年/); // 「新3年(現2年)」は現在の学年を採用
  if (current) return `${prefix}${current[1]}`;
  const plain = g.match(/([1-3])\s*年/);
  return plain ? `${prefix}${plain[1]}` : "";
}

export function normalizeRelation(raw: string): ParsedApplicationMail["relation"] {
  const t = clean(raw);
  if (!t) return "";
  if (/本人/.test(t)) return "self";
  if (/母|父|保護者|祖母|祖父|親/.test(t)) return "parent";
  return "other";
}

function jst(date: string, time: string): string | null {
  const d = nfkc(date).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const t = nfkc(time).match(/(\d{1,2}):(\d{2}):?(\d{2})?/);
  if (!d || !t) return null;
  const p = (n: string) => n.padStart(2, "0");
  return `${d[1]}-${p(d[2])}-${p(d[3])}T${p(t[1])}:${t[2]}:${t[3] ?? "00"}+09:00`;
}

function finish(d: Omit<ParsedApplicationMail, "missing">): ParseResult {
  const missing = (
    [["氏名", d.name], ["ふりがな", d.nameKana], ["学校", d.school], ["学年", d.grade], ["メール", d.email], ["電話", d.phone]] as const
  ).filter(([, v]) => !v).map(([k]) => k);
  return { ok: true, data: { ...d, missing } };
}

export function parseApplicationMail(input: { subject: string; body: string }): ParseResult {
  const subject = clean(input.subject);
  const lines = normalizeBody(input.body);

  // ---- B) 受験登録完了のお知らせ ----
  if (/登録完了|申込み?完了|お申し込み完了/.test(subject) || lines.some((l) => /^受験番号\s*[:：]/.test(l))) {
    const kv = keyValues(lines, /^([^:：=]{1,12}?)\s*[:：]\s*(.*)$/);
    const examNo = nfkc(kv.get("受験番号") ?? "");
    if (!examNo) return { ok: false, reason: "受験番号が見つかりません" };
    const heading = lines.find((l) => /^★/.test(l)) ?? "";
    const type = detectType(subject, heading);
    if (!type) return { ok: false, reason: "申込種別を判別できません" };
    return finish({
      sourceKey: `exam:${examNo}:${type.rawType}:${nfkc(type.eventLabel)}`,
      format: "exam_notice",
      ...type,
      name: clean(kv.get("氏名")),
      nameKana: clean(kv.get("フリガナ")),
      school: clean(kv.get("高校名")),
      grade: normalizeGrade(kv.get("学年") ?? "", "高等学校"),
      email: clean(kv.get("メールアドレス")),
      phone: nfkc(kv.get("携帯電話番号") || kv.get("電話番号") || ""),
      relation: "",
      gender: clean(kv.get("性別")),
      birthDate: nfkc(kv.get("生年月日") ?? ""),
      postalCode: nfkc(kv.get("郵便番号") ?? ""),
      address: clean(kv.get("住所")),
      comment: [kv.get("試験科目") && `試験科目: ${kv.get("試験科目")}`, kv.get("在籍区分") && `在籍区分: ${kv.get("在籍区分")}`, `受験番号: ${examNo}`].filter(Boolean).join(" / "),
      submittedAt: null,
    });
  }

  // ---- A) Web申込フォーム ----
  const kv = keyValues(lines, /^([^=＝]{1,20}?)\s*[=＝]\s*(.*)$/);
  const text = input.body;
  // webID は「)」や空白までを丸ごと使う。区切り文字の仕様変更で、別の申込が同じIDに見える（誤って重複扱いになる）のを防ぐ。
  const webId = text.match(/webID\s*=\s*([^\s)]+)/)?.[1];
  if (!webId) return { ok: false, reason: "webID が見つかりません（対象外のメールの可能性）" };
  const type = detectType(subject, kv.get("希望内容") ?? "");
  if (!type) return { ok: false, reason: "申込種別を判別できません" };

  // 「(連絡事項)」以降〜「メール送信型」までは自由記述
  const idx = lines.findIndex((l) => /^\(?連絡事項\)?/.test(l));
  const tail: string[] = [];
  if (idx >= 0) {
    for (const l of lines.slice(idx)) {
      if (/^メール送信型/.test(l)) break;
      tail.push(l.replace(/^\(?連絡事項\)?\s*/, ""));
    }
  }
  const sub = (k: string) => text.match(new RegExp(`\\(${k}=([^)]*)\\)`))?.[1] ?? "";
  const stage = kv.get("学校段階") ?? "";
  return finish({
    sourceKey: `web:${webId}`,
    format: "web_form",
    ...type,
    name: clean(`${kv.get("氏") ?? ""} ${kv.get("名") ?? ""}`),
    nameKana: clean(`${kv.get("氏(カナ)") ?? ""} ${kv.get("名(カナ)") ?? ""}`),
    school: clean(kv.get("学校名")),
    grade: normalizeGrade(kv.get("学年") ?? "", stage),
    email: clean(kv.get("メールアドレス")),
    phone: nfkc(kv.get("携帯電話番号") || kv.get("電話番号") || ""),
    relation: normalizeRelation(kv.get("ご記入者と生徒の関係") ?? ""),
    gender: clean(kv.get("性別")),
    birthDate: nfkc(kv.get("生年月日") ?? ""),
    postalCode: nfkc((kv.get("郵便番号") ?? "").replace(/^〒/, "")),
    address: clean(`${kv.get("都道府県") ?? ""}${kv.get("住所") ?? ""}`),
    comment: [
      kv.get("希望資料") && `希望資料: ${kv.get("希望資料")}`,
      sub("志望校") && `志望校: ${sub("志望校")}`,
      sub("文理") && `文理: ${sub("文理")}`,
      kv.get("HP来訪理由") && `来訪理由: ${kv.get("HP来訪理由")}`,
      clean(tail.join(" ")) && `連絡事項: ${clean(tail.join(" "))}`,
    ].filter(Boolean).join(" / "),
    submittedAt: jst(kv.get("Date") ?? "", kv.get("Time") ?? ""),
  });
}
