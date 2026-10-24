import { describe, it, expect } from "vitest";
import { formatJstDateTime, formatJstTime, jstDateKey } from "./jst";

describe("日本時間での日時整形", () => {
  it("UTCのISO文字列を日本時間で表示する", () => {
    // 2026-08-03 14:00 JST = 05:00 UTC
    expect(formatJstDateTime("2026-08-03T05:00:00.000Z")).toBe("8/3（月）14:00");
    expect(formatJstTime("2026-08-03T05:30:00.000Z")).toBe("14:30");
  });

  it("UTCでは前日でも日本時間の日付・曜日で表示する", () => {
    // 2026-08-03 08:00 JST = 2026-08-02 23:00 UTC（日曜）
    expect(formatJstDateTime("2026-08-02T23:00:00.000Z")).toBe("8/3（月）8:00");
    expect(jstDateKey("2026-08-02T23:00:00.000Z")).toBe("2026-08-03");
  });

  it("オフセット付きの入力も同じ時刻として扱う", () => {
    expect(formatJstDateTime("2026-08-03T14:00:00+09:00")).toBe("8/3（月）14:00");
  });
});
