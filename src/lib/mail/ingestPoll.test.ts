import { beforeEach, describe, expect, it, vi } from "vitest";
import Encoding from "encoding-japanese";

vi.mock("server-only", () => ({}));

// ---- 偽のDB（メモリ上）。upsert の onConflict / ignoreDuplicates と、eq/neq/in/limit だけ再現する ----
const db = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const failOn = new Set<string>(); // "テーブル名" を入れると、そのテーブルへの書き込みが失敗する
  const rows = (n: string) => (tables[n] ??= []);
  class Q {
    op = "select"; payload: unknown; opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    filters: ((r: Record<string, unknown>) => boolean)[] = []; limitN = Infinity; wantSelect = false; head = false;
    constructor(public table: string) {}
    select(_c?: string, o?: { head?: boolean }) { this.wantSelect = true; this.head = !!o?.head; return this; }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
    neq(k: string, v: unknown) { this.filters.push((r) => r[k] !== v); return this; }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this; }
    limit(n: number) { this.limitN = n; return this; }
    upsert(p: unknown, o?: Q["opts"]) { this.op = "upsert"; this.payload = p; this.opts = o ?? {}; return this; }
    insert(p: unknown) { this.op = "insert"; this.payload = p; return this; }
    update(p: unknown) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(this.run()).then(res, rej); }
    run() {
      const t = rows(this.table);
      if (this.op !== "select" && failOn.has(this.table)) return { data: null, error: { message: "db down" } };
      if (this.op === "upsert" || this.op === "insert") {
        const inserted: Record<string, unknown>[] = [];
        for (const x of (Array.isArray(this.payload) ? this.payload : [this.payload]) as Record<string, unknown>[]) {
          const key = this.opts.onConflict;
          const exists = key ? t.find((r) => r[key] === x[key]) : undefined;
          if (!exists) { t.push({ ...x }); inserted.push(x); }
          else if (!this.opts.ignoreDuplicates) Object.assign(exists, x);
        }
        return { data: this.wantSelect ? inserted : null, error: null };
      }
      if (this.op === "update") { t.filter((r) => this.filters.every((f) => f(r))).forEach((r) => Object.assign(r, this.payload)); return { data: null, error: null }; }
      const m = t.filter((r) => this.filters.every((f) => f(r)));
      return this.head ? { data: null, count: m.length, error: null } : { data: m.slice(0, this.limitN), count: m.length, error: null };
    }
  }
  return { tables, failOn, client: { from: (n: string) => new Q(n) } };
});
vi.mock("@/lib/supabase/adminClient", () => ({ supabaseAdmin: db.client }));

import { ingestMail } from "./ingest";
import { pollMailbox, type DryRunSummary, type PollSummary, type PopSession } from "./poll";

// ---- テスト用のメール（実際の通知メールの形式に合わせたダミー） ----
const BODY = (webId: string, name = ["山田", "太郎"]) => `Date = 2026/10/28
Time = 12:53:48
希望内容 = お申込み(冬期特別招待講習)
氏 = ${name[0]}
名 = ${name[1]}
氏(カナ) = ヤマダ
名(カナ) = タロウ
メールアドレス = taro@example.com
電話番号 = 090-0000-0001
学校名 = 春日部高等学校
学校段階 = 高等学校
学年 = 2 年
ご記入者と生徒の関係 = 母
(webID=${webId})
(連絡事項)
メール送信型 = ハイスクール`;
const SUBJECT = "[登録] 東進ハイスクール お申込み(冬期特別招待講習) 春日部校";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
function utf8Mail(subject: string, body: string, from = "Notifier <sender@toshin.com>", id = "m"): Buffer {
  return Buffer.from(
    `From: ${from}\r\nTo: school@example.invalid\r\nSubject: =?UTF-8?B?${b64(subject)}?=\r\nMessage-ID: <${id}@toshin.com>\r\nDate: Wed, 28 Oct 2026 12:54:00 +0900\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(body)}\r\n`
  );
}
function jisMail(subject: string, body: string): Buffer {
  const jis = (s: string) => Buffer.from(Encoding.convert(Buffer.from(s, "utf8"), { to: "JIS", from: "UTF8" }));
  return Buffer.concat([
    Buffer.from(`From: Notifier <sender@toshin.com>\r\nSubject: =?ISO-2022-JP?B?${jis(subject).toString("base64")}?=\r\nMessage-ID: <jis@toshin.com>\r\nContent-Type: text/plain; charset=ISO-2022-JP\r\nContent-Transfer-Encoding: 7bit\r\n\r\n`),
    jis(body), Buffer.from("\r\n"),
  ]);
}
const other = (id: string) => utf8Mail("会議のお知らせ", "本文", "boss@example.com", id);

// 偽のメール接続。呼ばれた操作を記録し、メール削除の操作が存在しないことを確認できる。
function session(mails: (Buffer | Error)[]) {
  const calls: string[] = [];
  const s: PopSession = {
    connect: async () => { calls.push("connect"); },
    uidl: async () => { calls.push("uidl"); return mails.map((_, i) => ({ n: i + 1, uid: `uid-${i + 1}` })); },
    retr: async (n) => { calls.push(`retr:${n}`); const m = mails[n - 1]; if (m instanceof Error) throw m; return m; },
    quit: async () => { calls.push("quit"); },
  };
  return { s, calls };
}

beforeEach(() => {
  for (const k of Object.keys(db.tables)) delete db.tables[k];
  db.failOn.clear();
});
const count = (t: string) => (db.tables[t] ?? []).length;

describe("ingestMail（段階5・6: 重複防止と登録）", () => {
  it("申込を生徒・申込・取込記録として登録する", async () => {
    const r = await ingestMail({ subject: SUBJECT, body: BODY("web-1") });
    expect(r).toMatchObject({ status: "registered", missing: [] });
    expect(db.tables.schedule_students[0]).toMatchObject({ name: "山田 太郎", grade: "高2", school: "春日部高等学校", phone: "090-0000-0001" });
    expect(db.tables.schedule_enrollments[0]).toMatchObject({ raw_type: "special_invite", channel: "mail" });
    expect(db.tables.schedule_mail_ingests[0]).toMatchObject({ status: "registered", source_key: "web:web-1" });
  });

  it("同じ通知を2回処理しても、生徒も申込も1件のまま", async () => {
    await ingestMail({ subject: SUBJECT, body: BODY("web-1") });
    const again = await ingestMail({ subject: SUBJECT, body: BODY("web-1") });
    expect(again.status).toBe("duplicate");
    expect([count("schedule_students"), count("schedule_enrollments"), count("schedule_mail_ingests")]).toEqual([1, 1, 1]);
  });

  it("読み取れないメールは登録せず確認待ちに残し、再処理しても1件", async () => {
    for (let i = 0; i < 2; i++) expect(await ingestMail({ subject: "[登録] 資料請求", body: "氏 = 山田" })).toMatchObject({ status: "needs_review" });
    expect(count("schedule_students")).toBe(0);
    expect(db.tables.schedule_mail_ingests).toHaveLength(1);
    expect(db.tables.schedule_mail_ingests[0].status).toBe("needs_review");
  });

  it("同じメールアドレスの既存生徒がいても自動では統合せず、候補の印だけ付ける", async () => {
    await ingestMail({ subject: SUBJECT, body: BODY("web-1") });
    await ingestMail({ subject: SUBJECT, body: BODY("web-2", ["山田", "花子"]) });
    expect(count("schedule_students")).toBe(2);
    const second = db.tables.schedule_students[1];
    expect(second.merge_candidate_of).toBe(db.tables.schedule_students[0].id);
  });

  it("DBに書けないときはエラーを返す（登録済みと誤認させない）", async () => {
    db.failOn.add("schedule_students");
    expect((await ingestMail({ subject: SUBJECT, body: BODY("web-1") })).status).toBe("error");
  });
});

describe("pollMailbox（段階2・4・8: 取得・削除しない・再試行）", () => {
  const nine = [other("a"), other("b")];

  it("初回は既存メールを取り込まず『確認済み』にするだけ（本文も取得しない）", async () => {
    const { s, calls } = session(nine);
    const r = (await pollMailbox({ session: s })) as PollSummary;
    expect(r.baseline).toBe(2);
    expect(calls.some((c) => c.startsWith("retr"))).toBe(false);
    expect(count("schedule_students")).toBe(0);
    expect(count("schedule_mail_pop_seen")).toBe(2);
  });

  it("2回目以降は新着だけ処理。申込は登録し、それ以外は読み飛ばす。再実行しても増えない", async () => {
    await pollMailbox({ session: session(nine).s }); // 初回（既存2通を確認済みに）
    const mails = [...nine, utf8Mail(SUBJECT, BODY("web-9"), undefined, "n1"), other("c")];
    const r1 = (await pollMailbox({ session: session(mails).s })) as PollSummary;
    expect(r1).toMatchObject({ checked: 2, skipped: 1, remaining: 0 });
    expect(r1.ingested).toEqual([{ status: "registered", count: 1 }]);
    const r2 = (await pollMailbox({ session: session(mails).s })) as PollSummary;
    expect(r2.checked).toBe(0);
    expect(count("schedule_students")).toBe(1);
  });

  it("サーバー上のメールを削除する操作は一切呼ばない（接続・一覧・取得・終了のみ）", async () => {
    await pollMailbox({ session: session(nine).s });
    const { s, calls } = session([...nine, utf8Mail(SUBJECT, BODY("web-9"))]);
    await pollMailbox({ session: s });
    const ops = new Set(calls.map((c) => c.split(":")[0]));
    expect([...ops].every((o) => ["connect", "uidl", "retr", "quit"].includes(o))).toBe(true);
    expect(calls.at(-1)).toBe("quit");
  });

  it("日本語メールで一般的な ISO-2022-JP の件名・本文も読み取れる", async () => {
    await pollMailbox({ session: session(nine).s });
    const r = (await pollMailbox({ session: session([...nine, jisMail(SUBJECT, BODY("web-jis"))]).s })) as PollSummary;
    expect(r.ingested).toEqual([{ status: "registered", count: 1 }]);
    expect(db.tables.schedule_students[0].name).toBe("山田 太郎");
  });

  it("壊れて取得できない1通があっても、後ろの新着が止まらない", async () => {
    await pollMailbox({ session: session(nine).s });
    const mails = [...nine, new Error("retr failed"), utf8Mail(SUBJECT, BODY("web-9"))];
    const r = (await pollMailbox({ session: session(mails).s })) as PollSummary;
    expect(r).toMatchObject({ checked: 2, unreadable: 1 });
    expect(count("schedule_students")).toBe(1);
  });

  it("DBへの登録に失敗したら止まり、そのメールは『確認済み』にしない（次回やり直す）", async () => {
    await pollMailbox({ session: session(nine).s });
    const mails = [...nine, utf8Mail(SUBJECT, BODY("web-9"))];
    db.failOn.add("schedule_students");
    await expect(pollMailbox({ session: session(mails).s })).rejects.toThrow();
    expect(db.tables.schedule_mail_pop_seen.some((r) => r.uid === "uid-3")).toBe(false);
    db.failOn.clear();
    const retry = (await pollMailbox({ session: session(mails).s })) as PollSummary;
    expect(retry.checked).toBe(1);
    expect(count("schedule_students")).toBe(1);
  });

  it("1回の処理件数に上限があり、残りは次回に回る", async () => {
    await pollMailbox({ session: session([other("x")]).s });
    const many = [other("x"), ...Array.from({ length: 20 }, (_, i) => other(`n${i}`))];
    const r = (await pollMailbox({ session: session(many).s })) as PollSummary;
    expect(r).toMatchObject({ checked: 15, remaining: 5 });
  });
});

describe("pollMailbox ドライラン（実メールの安全な事前確認）", () => {
  it("DBに一切触れず、氏名・件名・本文を結果に含めない", async () => {
    const mails = [other("a"), utf8Mail(SUBJECT, BODY("web-1")), utf8Mail("[登録] 資料請求", "氏 = 山田")];
    const { s, calls } = session(mails);
    const r = (await pollMailbox({ session: s, dryRun: true, last: 5 })) as DryRunSummary;
    expect(r.mailboxCount).toBe(3);
    expect(r.items).toEqual([
      { position: 1, result: "needs_review", reason: expect.any(String) },
      { position: 2, result: "register", rawType: "special_invite", missing: [] },
      { position: 3, result: "skip" },
    ]);
    expect(Object.keys(db.tables)).toHaveLength(0); // 読み書きとも一切なし
    const json = JSON.stringify(r);
    for (const secret of ["山田", "taro@example.com", "090-0000-0001", "春日部高等学校", "会議"]) expect(json).not.toContain(secret);
    expect(calls.every((c) => ["connect", "uidl", "quit"].includes(c) || c.startsWith("retr:"))).toBe(true);
  });

  it("確認する通数に上限がある", async () => {
    const mails = Array.from({ length: 30 }, (_, i) => other(String(i)));
    const r = (await pollMailbox({ session: session(mails).s, dryRun: true, last: 999 })) as DryRunSummary;
    expect(r.items).toHaveLength(20);
  });
});
