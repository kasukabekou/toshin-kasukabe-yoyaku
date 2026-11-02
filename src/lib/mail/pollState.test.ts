import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => {
  const st = { row: null as Record<string, unknown> | null, failRead: false, failWrite: false };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => (st.failRead ? { data: null, error: { message: "x" } } : { data: st.row, error: null }) }) }),
      upsert: async (r: Record<string, unknown>) => {
        if (st.failWrite) return { error: { message: "x" } };
        st.row = { ...r };
        return { error: null };
      },
    }),
  };
  return { st, client };
});
vi.mock("@/lib/supabase/adminClient", () => ({ supabaseAdmin: db.client }));

import { checkStale, classifyFailure, recordPollFailure, recordPollSuccess } from "./pollState";

const notify = vi.fn(async (_t: string) => true);
beforeEach(() => {
  db.st.row = null;
  db.st.failRead = false;
  db.st.failWrite = false;
  notify.mockClear();
});

describe("classifyFailure（原因の種類だけに分類）", () => {
  it.each([
    [new Error("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), "tls"],
    [new Error("POP3 error: -ERR [AUTH] failed"), "auth"],
    [Object.assign(new Error("connect"), { code: "ETIMEDOUT" }), "timeout"],
    [new Error("POP3 timeout"), "timeout"],
    [new Error('relation "x" does not exist'), "database"],
    [new Error("something"), "other"],
  ] as const)("%s → %s", (e, kind) => expect(classifyFailure(e)).toBe(kind));
});

describe("連続失敗の通知（一時的な失敗では通知しない／1回だけ／復旧で1回）", () => {
  it("2回失敗では通知せず、3回目で1回だけ通知し、その後は繰り返さない", async () => {
    await recordPollFailure("timeout", notify);
    await recordPollFailure("timeout", notify);
    expect(notify).not.toHaveBeenCalled();
    await recordPollFailure("timeout", notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("3回連続");
    await recordPollFailure("timeout", notify);
    await recordPollFailure("timeout", notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(db.st.row).toMatchObject({ consecutive_failures: 5, alerted: true });
  });

  it("失敗の途中で成功すると回数がリセットされ、通知なしで済む", async () => {
    await recordPollFailure("auth", notify);
    await recordPollFailure("auth", notify);
    await recordPollSuccess(notify);
    await recordPollFailure("auth", notify);
    await recordPollFailure("auth", notify);
    expect(notify).not.toHaveBeenCalled();
    expect(db.st.row).toMatchObject({ consecutive_failures: 2, alerted: false });
  });

  it("通知後に成功すると、復旧を1回だけ知らせる", async () => {
    for (let i = 0; i < 3; i++) await recordPollFailure("tls", notify);
    notify.mockClear();
    await recordPollSuccess(notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("復旧");
    await recordPollSuccess(notify);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("通知に失敗したら未通知のままにして、次回また通知を試みる", async () => {
    const ng = vi.fn(async () => false);
    for (let i = 0; i < 3; i++) await recordPollFailure("tls", ng);
    expect(db.st.row).toMatchObject({ alerted: false });
    await recordPollFailure("tls", notify);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("通知文に、ホスト名・パスワード・エラー文の原文を含めない", async () => {
    for (let i = 0; i < 3; i++) await recordPollFailure("auth", notify);
    expect(notify.mock.calls[0][0]).not.toMatch(/-ERR|password|\.invalid/i);
  });

  it("状態テーブルが使えなくても例外を投げない（取込を止めない）", async () => {
    db.st.failRead = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordPollFailure("other", notify)).resolves.toBeUndefined();
    await expect(recordPollSuccess(notify)).resolves.toBeUndefined();
    log.mockRestore();
  });
});

describe("見張り（checkStale）", () => {
  const T0 = new Date("2026-11-02T10:00:00Z");

  it("最近成功していれば何もしない", async () => {
    await recordPollSuccess(notify, new Date(T0.getTime() - 5 * 60000));
    expect((await checkStale(notify, T0)).status).toBe("ok");
    expect(notify).not.toHaveBeenCalled();
  });

  it("20分を超えて成功がなければ1回だけ通知し、繰り返さない。復旧時に知らせる", async () => {
    await recordPollSuccess(notify, new Date(T0.getTime() - 30 * 60000));
    expect((await checkStale(notify, T0)).status).toBe("stale");
    await checkStale(notify, T0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("30分間");
    notify.mockClear();
    await recordPollSuccess(notify, T0);
    expect(notify.mock.calls[0][0]).toContain("復旧");
  });

  it("一度も成功していない場合も通知する", async () => {
    await checkStale(notify, T0);
    expect(notify.mock.calls[0][0]).toContain("まだ一度も");
  });

  it("状態を読めないときは通知して unknown を返す", async () => {
    db.st.failRead = true;
    expect((await checkStale(notify, T0)).status).toBe("unknown");
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
