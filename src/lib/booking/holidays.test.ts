import { describe, it, expect } from "vitest";
import { isOffDayKey, isHolidayKey } from "./holidays";
import { businessHoursFor, generateInterviewSlots, gradeGroupForGrade } from "./logic";
import { validateInterviewSlot, validateTestSegments } from "./validateSlots";

const NOW = new Date("2026-11-01T00:00:00+09:00");

describe("日曜・祝日の扱い", () => {
  it("祝日と日曜は19時閉館の日、平日・土曜は違う", () => {
    expect(isHolidayKey("2026-11-23")).toBe(true);
    expect(isOffDayKey("2026-11-23")).toBe(true); // 月曜の祝日
    expect(isOffDayKey("2026-11-22")).toBe(true); // 日曜
    expect(isOffDayKey("2026-11-24")).toBe(false); // 火曜
    expect(isOffDayKey("2026-11-21")).toBe(false); // 土曜
  });
  it("祝日の営業時間は日曜と同じ10:00〜19:00", () => {
    const { start, end } = businessHoursFor(new Date(2026, 10, 23));
    expect([start.getHours(), end.getHours(), end.getMinutes()]).toEqual([10, 19, 0]);
  });
  it("日曜・祝日の面談は18:00開始が最終枠、平日は従来どおり20:00開始が最終枠", () => {
    const last = (y: number, m: number, d: number) => {
      const s = generateInterviewSlots(new Date(y, m - 1, d, 0, 0), [], { daysToScan: 1 });
      return s[s.length - 1].startAt;
    };
    expect([last(2026, 11, 22).getHours(), last(2026, 11, 22).getMinutes()]).toEqual([18, 0]);
    expect([last(2026, 11, 23).getHours(), last(2026, 11, 23).getMinutes()]).toEqual([18, 0]);
    expect([last(2026, 11, 24).getHours(), last(2026, 11, 24).getMinutes()]).toEqual([20, 0]);
  });
  it("サーバー検証：日曜の19:00開始の面談は拒否、18:00開始は許可", () => {
    expect(validateInterviewSlot({ startAt: "2026-11-22T19:00:00+09:00", endAt: "2026-11-22T20:30:00+09:00" }, NOW)).toBe("outside_hours");
    expect(validateInterviewSlot({ startAt: "2026-11-22T18:00:00+09:00", endAt: "2026-11-22T19:30:00+09:00" }, NOW)).toBeNull();
    expect(validateInterviewSlot({ startAt: "2026-11-24T19:00:00+09:00", endAt: "2026-11-24T20:30:00+09:00" }, NOW)).toBeNull();
  });
  it("サーバー検証：祝日のテストは19時を超えると拒否", () => {
    const seg = (end: string) => [{ startAt: "2026-11-23T15:00:00+09:00", endAt: `2026-11-23T${end}:00+09:00`, dayIndex: 0 }];
    expect(validateTestSegments(seg("19:30"), NOW)).toBe("outside_hours");
    expect(validateTestSegments(seg("19:00"), NOW)).toBeNull();
  });
});

describe("学力診断テストの種別", () => {
  it("高1は基礎力型、高2・高3は共テ型", () => {
    expect(gradeGroupForGrade("高1")).toBe("g12");
    expect(gradeGroupForGrade("高2")).toBe("g3");
    expect(gradeGroupForGrade("高3")).toBe("g3");
  });
});
