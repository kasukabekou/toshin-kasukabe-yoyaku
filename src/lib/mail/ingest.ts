import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { audit } from "@/lib/manage/server";
import { parseApplicationMail } from "./parseApplicationMail";

export type IngestOutcome =
  | { status: "registered" | "duplicate"; studentId: string; missing: string[] }
  | { status: "needs_review"; reason: string }
  | { status: "error"; message: string };

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

// 申込通知メール1通を登録する。同じメールを何度処理しても申込は1件（source_key で重複防止）。
export async function ingestMail(input: { subject: string; body: string; from?: string; messageId?: string; receivedAt?: string }): Promise<IngestOutcome> {
  const { subject, body, from, messageId, receivedAt } = input;
  const result = parseApplicationMail({ subject, body });
  if (!result.ok) {
    // 読み取れないメールは登録せず、確認待ちに残す（自動返信などもしない）
    const key = `msg:${messageId ?? hash(subject + body)}`;
    const { error } = await supabaseAdmin.from("schedule_mail_ingests").upsert(
      { id: `mail_${hash(key)}`, source_key: key, status: "needs_review", subject, from_address: from ?? "", body, reason: result.reason, received_at: receivedAt ?? null },
      { onConflict: "source_key", ignoreDuplicates: true }
    );
    if (error) return { status: "error", message: error.message };
    return { status: "needs_review", reason: result.reason };
  }

  const d = result.data;
  const h = hash(d.sourceKey);
  const studentId = `stu_mail_${h}`;

  // 先に取込記録を確保して重複を判定。生徒・申込は決まったIDで upsert するので、途中で失敗して再実行しても1件になる。
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("schedule_mail_ingests")
    .upsert(
      { id: `mail_${h}`, source_key: d.sourceKey, status: "registered", subject, from_address: from ?? "", body, parsed: d, received_at: receivedAt ?? d.submittedAt },
      { onConflict: "source_key", ignoreDuplicates: true }
    )
    .select("id");
  if (claimErr) return { status: "error", message: claimErr.message };
  const duplicate = (claimed ?? []).length === 0;

  // 名寄せは自動確定しない。同じメールアドレスの既存生徒は「統合候補」として印を付けるだけ。
  let mergeCandidate: string | null = null;
  if (d.email) {
    const { data: same } = await supabaseAdmin.from("schedule_students").select("id").eq("email", d.email).neq("id", studentId).limit(1);
    mergeCandidate = (same?.[0]?.id as string | undefined) ?? null;
  }
  const { error: sErr } = await supabaseAdmin.from("schedule_students").upsert(
    { id: studentId, name: d.name, name_kana: d.nameKana, school: d.school, grade: d.grade, email: d.email, phone: d.phone, merge_candidate_of: mergeCandidate },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (sErr) return { status: "error", message: sErr.message };
  const { error: eErr } = await supabaseAdmin.from("schedule_enrollments").upsert(
    { id: `enr_mail_${h}`, student_id: studentId, raw_type: d.rawType, channel: "mail", ...(d.submittedAt ? { created_at: d.submittedAt } : {}) },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (eErr) return { status: "error", message: eErr.message };
  if (!duplicate) {
    await supabaseAdmin.from("schedule_mail_ingests").update({ student_id: studentId }).eq("id", `mail_${h}`);
    await audit("schedule_students", studentId, "insert", null, { via: "mail", rawType: d.rawType });
  }
  return { status: duplicate ? "duplicate" : "registered", studentId, missing: d.missing };
}
