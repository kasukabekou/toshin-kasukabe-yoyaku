import { describe, it, expect, beforeEach } from "vitest";
import { buildSessionCookieValue, isValidSessionCookieValue, verifyAccessCode, STAFF_SESSION_MAX_AGE_SECONDS } from "./auth";

beforeEach(() => {
  process.env.STAFF_SESSION_SECRET = "test-secret";
  process.env.STAFF_ACCESS_CODE = "correct-code";
});

describe("スタッフ認証", () => {
  it("正しいアクセスコードだけ通す", async () => {
    expect(await verifyAccessCode("correct-code")).toBe(true);
    expect(await verifyAccessCode("wrong")).toBe(false);
  });

  it("発行したセッションは期限内なら有効", async () => {
    const now = Date.now();
    const v = await buildSessionCookieValue(now);
    expect(await isValidSessionCookieValue(v, now + 60_000)).toBe(true);
  });

  it("期限を過ぎたセッションは無効", async () => {
    const now = Date.now();
    const v = await buildSessionCookieValue(now);
    expect(await isValidSessionCookieValue(v, now + STAFF_SESSION_MAX_AGE_SECONDS * 1000 + 1)).toBe(false);
  });

  it("発行時刻を書き換えたセッションは無効", async () => {
    const now = Date.now();
    const [, sig] = (await buildSessionCookieValue(now)).split(".");
    expect(await isValidSessionCookieValue(`${now + 1000}.${sig}`, now)).toBe(false);
  });

  it("旧形式（固定値）のCookieは無効", async () => {
    expect(await isValidSessionCookieValue("abcdef", Date.now())).toBe(false);
  });

  it("秘密鍵を変えると既存セッションは無効になる", async () => {
    const now = Date.now();
    const v = await buildSessionCookieValue(now);
    process.env.STAFF_SESSION_SECRET = "rotated";
    expect(await isValidSessionCookieValue(v, now)).toBe(false);
  });
});
