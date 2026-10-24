import { describe, it, expect } from "vitest";
import { validateInterviewSlot, validateTestSegments } from "./validateSlots";

const NOW = new Date("2026-10-01T00:00:00.000Z");
// 2026-10-05（月）14:00〜15:30 JST
const interview = { startAt: "2026-10-05T05:00:00.000Z", endAt: "2026-10-05T06:30:00.000Z" };

describe("面談枠のサーバー側検証", () => {
  it("正しい枠は通す", () => {
    expect(validateInterviewSlot(interview, NOW)).toBeNull();
  });
  it("過去の日時は拒否する", () => {
    expect(validateInterviewSlot(interview, new Date("2026-10-06T00:00:00.000Z"))).toBe("past_datetime");
  });
  it("90分以外の長さは拒否する", () => {
    expect(validateInterviewSlot({ ...interview, endAt: "2026-10-05T09:00:00.000Z" }, NOW)).toBe("invalid_duration");
  });
  it("日本時間の深夜は拒否する（UTCでは昼でも）", () => {
    // 2026-10-05 02:00〜03:30 JST
    expect(validateInterviewSlot({ startAt: "2026-10-04T17:00:00.000Z", endAt: "2026-10-04T18:30:00.000Z" }, NOW)).toBe("outside_hours");
  });
  it("15分刻みでない開始は拒否する", () => {
    expect(validateInterviewSlot({ startAt: "2026-10-05T05:07:00.000Z", endAt: "2026-10-05T06:37:00.000Z" }, NOW)).toBe("off_grid");
  });
  it("日時として読めない値は拒否する", () => {
    expect(validateInterviewSlot({ startAt: "abc", endAt: "def" }, NOW)).toBe("invalid_datetime");
  });
});

describe("テスト枠のサーバー側検証", () => {
  const seg = { startAt: "2026-10-05T04:00:00.000Z", endAt: "2026-10-05T08:00:00.000Z", dayIndex: 0 }; // 13:00〜17:00 JST
  it("正しい枠は通す", () => {
    expect(validateTestSegments([seg, { ...seg, startAt: "2026-10-06T04:00:00.000Z", endAt: "2026-10-06T08:00:00.000Z", dayIndex: 1 }], NOW)).toBeNull();
  });
  it("終了が開始より前なら拒否する", () => {
    expect(validateTestSegments([{ ...seg, endAt: seg.startAt }], NOW)).toBe("invalid_range");
  });
  it("休館日は拒否する", () => {
    expect(validateTestSegments([{ startAt: "2026-08-12T04:00:00.000Z", endAt: "2026-08-12T05:00:00.000Z", dayIndex: 0 }], new Date("2026-08-01T00:00:00.000Z"))).toBe("closed_date");
  });
  it("22時を過ぎる枠は拒否する", () => {
    expect(validateTestSegments([{ ...seg, endAt: "2026-10-05T13:30:00.000Z" }], NOW)).toBe("outside_hours");
  });
  it("同じ日目が重複したら拒否する", () => {
    expect(validateTestSegments([seg, seg], NOW)).toBe("duplicate_day_index");
  });
});
