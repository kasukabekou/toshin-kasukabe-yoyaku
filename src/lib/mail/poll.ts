import "server-only";
import { simpleParser } from "mailparser";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { ingestMail, type IngestOutcome } from "./ingest";
import { parseApplicationMail } from "./parseApplicationMail";
import { Pop3Client, pop3ConfigFromEnv } from "./pop3";

const MAX_PER_RUN = 15; // 1回の実行で処理する最大件数（実行時間の上限対策。残りは次回）
const DRY_RUN_DEFAULT = 5;
const DRY_RUN_MAX = 20;

export const isApplicationMail = (subject: string, from: string) =>
  /toshin\.com/i.test(from) && (/^\[登録\]/.test(subject.trim()) || /登録完了のお知らせ/.test(subject));

// 接続の差し替え口（テストでは偽物を渡す）。サーバー上のメールを削除する操作は含まない。
export interface PopSession {
  connect(): Promise<void>;
  uidl(): Promise<{ n: number; uid: string }[]>;
  retr(n: number): Promise<Buffer>;
  quit(): Promise<void>;
}

export interface PollSummary {
  baseline?: number; // 初回：既存メールを処理済みとして記録した件数（取り込みはしない）
  checked: number;
  ingested: { status: IngestOutcome["status"]; count: number }[];
  skipped: number;
  unreadable: number;
  remaining: number;
}

export interface DryRunItem {
  // 件名・本文・氏名などの個人情報は返さない。種別と、不足項目の名前だけ。
  position: number; // 新しい順（1が最新）
  result: "register" | "needs_review" | "skip" | "unreadable";
  rawType?: string;
  missing?: string[];
  reason?: string;
}
export interface DryRunSummary {
  dryRun: true;
  mailboxCount: number;
  items: DryRunItem[];
}

export interface PollOptions {
  dryRun?: boolean;
  last?: number; // ドライラン：新しい方から何通を確認するか
  session?: PopSession;
}

async function parseRaw(raw: Buffer) {
  const parsed = await simpleParser(raw);
  const subject = parsed.subject ?? "";
  const from = parsed.from?.value?.[0]?.address ?? "";
  const body = parsed.text ?? (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, "\n") : "");
  return { subject, from, body, messageId: parsed.messageId, receivedAt: parsed.date?.toISOString() };
}

function openSession(opts: PollOptions): PopSession {
  if (opts.session) return opts.session;
  const cfg = pop3ConfigFromEnv();
  if (!cfg) throw new Error("MAIL_POP_HOST / MAIL_POP_USER / MAIL_POP_PASSWORD が未設定です。");
  return new Pop3Client(cfg);
}

// 取り込みの予行演習。DBには一切書かず（読みもせず）、新しい方から数通を解析して「どう扱われるか」だけを返す。
async function dryRun(client: PopSession, last: number): Promise<DryRunSummary> {
  const list = await client.uidl();
  const picked = list.slice(-Math.min(Math.max(last, 1), DRY_RUN_MAX)).reverse();
  const items: DryRunItem[] = [];
  for (const [i, m] of picked.entries()) {
    try {
      const mail = await parseRaw(await client.retr(m.n));
      if (!isApplicationMail(mail.subject, mail.from)) {
        items.push({ position: i + 1, result: "skip" });
        continue;
      }
      const r = parseApplicationMail({ subject: mail.subject, body: mail.body });
      items.push(
        r.ok
          ? { position: i + 1, result: "register", rawType: r.data.rawType, missing: r.data.missing }
          : { position: i + 1, result: "needs_review", reason: r.reason }
      );
    } catch {
      items.push({ position: i + 1, result: "unreadable" });
    }
  }
  return { dryRun: true, mailboxCount: list.length, items };
}

// メールボックスの新着を確認し、申込通知を登録する。サーバー上のメールは削除しない。
export async function pollMailbox(opts: PollOptions = {}): Promise<PollSummary | DryRunSummary> {
  const client = openSession(opts);
  try {
    await client.connect();
    if (opts.dryRun) return await dryRun(client, opts.last ?? DRY_RUN_DEFAULT);

    const list = await client.uidl();
    const { count } = await supabaseAdmin.from("schedule_mail_pop_seen").select("uid", { count: "exact", head: true });
    if ((count ?? 0) === 0 && list.length > 0) {
      // 初回は過去メールを取り込まない。既存分を「確認済み」にして、以降の新着だけを処理する。
      for (let i = 0; i < list.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("schedule_mail_pop_seen")
          .upsert(list.slice(i, i + 500).map((m) => ({ uid: m.uid, note: "baseline" })), { onConflict: "uid", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      return { baseline: list.length, checked: 0, ingested: [], skipped: 0, unreadable: 0, remaining: 0 };
    }

    const { data: seenRows } = await supabaseAdmin.from("schedule_mail_pop_seen").select("uid").in("uid", list.map((m) => m.uid));
    const seen = new Set((seenRows ?? []).map((r) => r.uid as string));
    const unseen = list.filter((m) => !seen.has(m.uid));
    const batch = unseen.slice(0, MAX_PER_RUN);

    const tally = new Map<IngestOutcome["status"], number>();
    let skipped = 0;
    let unreadable = 0;
    for (const m of batch) {
      let note = "skipped";
      let mail: Awaited<ReturnType<typeof parseRaw>> | null = null;
      try {
        mail = await parseRaw(await client.retr(m.n));
      } catch {
        // 壊れたメール1通で、後ろの新着が止まらないようにする（確認済みにして先へ進む）
        note = "unreadable";
        unreadable++;
      }
      if (mail && isApplicationMail(mail.subject, mail.from)) {
        const r = await ingestMail(mail);
        if (r.status === "error") throw new Error(r.message); // 確認済みにせず止め、次回再試行する
        tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
        note = "ingested";
      } else if (mail) {
        skipped++;
      }
      await supabaseAdmin.from("schedule_mail_pop_seen").upsert({ uid: m.uid, note }, { onConflict: "uid", ignoreDuplicates: true });
    }
    return {
      checked: batch.length,
      ingested: [...tally].map(([status, count]) => ({ status, count })),
      skipped,
      unreadable,
      remaining: unseen.length - batch.length,
    };
  } finally {
    await client.quit();
  }
}
