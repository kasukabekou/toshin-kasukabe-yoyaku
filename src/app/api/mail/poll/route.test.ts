import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  pollMailbox: vi.fn(),
  recordPollSuccess: vi.fn(),
  recordPollFailure: vi.fn(),
  checkStale: vi.fn(),
  sendSlack: vi.fn(),
}));
vi.mock("@/lib/mail/poll", () => ({ pollMailbox: m.pollMailbox }));
vi.mock("@/lib/mail/pollState", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mail/pollState")>("@/lib/mail/pollState").catch(() => null);
  return { classifyFailure: actual?.classifyFailure ?? (() => "other"), recordPollSuccess: m.recordPollSuccess, recordPollFailure: m.recordPollFailure, checkStale: m.checkStale };
});
vi.mock("@/lib/supabase/adminClient", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/notify/slack", () => ({ sendSlack: m.sendSlack }));

import { GET } from "./route";
import { GET as watchdog } from "../watchdog/route";

const ADMIN = "admin-secret-0123456789";
const CRON = "cron-secret-0123456789";
const call = (qs: string, secret?: string, fn: (r: Request) => Promise<Response> = GET) =>
  fn(new Request(`http://localhost/api/mail/poll${qs}`, { headers: secret ? { "x-ingest-secret": secret } : {} }));
const summary = (over: object = {}) => ({ checked: 1, ingested: [{ status: "registered", count: 1 }], skipped: 0, skippedFromToshin: 0, unreadable: 0, remaining: 0, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAIL_INGEST_SECRET = ADMIN;
  process.env.MAIL_CRON_SECRET = CRON;
  m.pollMailbox.mockResolvedValue(summary());
  m.checkStale.mockResolvedValue({ status: "ok", minutes: 1 });
});

describe("認証（定期実行用シークレットの権限を絞る）", () => {
  it("シークレットなし・誤りは401で、何も実行しない", async () => {
    expect((await call("")).status).toBe(401);
    expect((await call("", "wrong")).status).toBe(401);
    expect(m.pollMailbox).not.toHaveBeenCalled();
  });
  it("通常の取込は、定期実行用でも管理用でも実行できる", async () => {
    expect((await call("", CRON)).status).toBe(200);
    expect((await call("", ADMIN)).status).toBe(200);
  });
  it.each(["?dryRun=1", "?backfill=1", "?dryRun=1&census=1", "?backfill=1&dryRun=1&offset=80"])("%s は定期実行用シークレットでは実行できない", async (qs) => {
    expect((await call(qs, CRON)).status).toBe(401);
    expect(m.pollMailbox).not.toHaveBeenCalled();
    expect((await call(qs, ADMIN)).status).toBe(200);
  });
  it("管理用の操作では、成功・失敗の記録も通知もしない", async () => {
    await call("?backfill=1&dryRun=1", ADMIN);
    expect(m.recordPollSuccess).not.toHaveBeenCalled();
    expect(m.sendSlack).not.toHaveBeenCalled();
  });
});

describe("通常の取込", () => {
  it("成功を記録し、読み取れない通知がなければ Slack に送らない", async () => {
    const res = await call("", CRON);
    expect(await res.json()).toMatchObject({ ok: true, checked: 1 });
    expect(m.recordPollSuccess).toHaveBeenCalledTimes(1);
    expect(m.sendSlack).not.toHaveBeenCalled();
  });
  it("読み取れない申込通知が出たら Slack に件数を通知する（個人情報は含まない）", async () => {
    m.pollMailbox.mockResolvedValue(summary({ ingested: [{ status: "needs_review", count: 2 }] }));
    await call("", CRON);
    expect(m.sendSlack).toHaveBeenCalledTimes(1);
    expect(m.sendSlack.mock.calls[0][0]).toContain("2件");
  });
  it("失敗したら502を返し、失敗を記録する。応答に内部の詳細を含めない", async () => {
    m.pollMailbox.mockRejectedValue(new Error("POP3 error: -ERR secret-detail mail.example.invalid"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("", CRON);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret-detail|example\.invalid|-ERR/);
    expect(m.recordPollFailure).toHaveBeenCalledTimes(1);
    expect(m.recordPollSuccess).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-detail|example\.invalid/);
    log.mockRestore();
  });
});

describe("見張り(watchdog)", () => {
  it("認証が必要で、定期実行用シークレットで実行できる", async () => {
    expect((await call("", undefined, watchdog)).status).toBe(401);
    const res = await call("", CRON, watchdog);
    expect(await res.json()).toMatchObject({ ok: true, status: "ok" });
    expect(m.checkStale).toHaveBeenCalledTimes(1);
  });
});
