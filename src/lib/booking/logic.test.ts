import { describe, it, expect } from "vitest";
import {
  businessHoursFor, subjectMinutes, totalTestMinutes, computeTestSession, canFitSubjects, generateInterviewSlots,
  patternForRawType, recommendBaseSubjects, recommendRikaCount, isClosedDate, splitSubjectsForDay,
} from "./logic";
import type { BusyBlock, SubjectKeyG3 } from "../types";

function dateAt(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe("申込パターン判定", () => {
  it("特別招待講習・資料請求・1日体験はパターンC", () => {
    expect(patternForRawType("special_invite")).toBe("C");
    expect(patternForRawType("document_request")).toBe("C");
    expect(patternForRawType("trial_day")).toBe("C");
  });
  it("個別説明会系はパターンB", () => {
    expect(patternForRawType("briefing")).toBe("B");
    expect(patternForRawType("school_course_briefing")).toBe("B");
  });
  it("特別公開授業はパターンA", () => {
    expect(patternForRawType("open_class")).toBe("A");
  });
});

describe("営業時間（通常期・2026年9月以降を想定）", () => {
  it("平日は13:00〜21:30", () => {
    const mon = dateAt(2026, 9, 14); // 月曜
    const { start, end } = businessHoursFor(mon);
    expect(start.getHours()).toBe(13);
    expect(end.getHours()).toBe(21);
    expect(end.getMinutes()).toBe(30);
  });
  it("土曜は10:00〜21:30", () => {
    const sat = dateAt(2026, 9, 19);
    const { start, end } = businessHoursFor(sat);
    expect(start.getHours()).toBe(10);
    expect(end.getHours()).toBe(21);
  });
  it("日曜は10:00〜19:00", () => {
    const sun = dateAt(2026, 9, 20);
    const { start, end } = businessHoursFor(sun);
    expect(start.getHours()).toBe(10);
    expect(end.getHours()).toBe(19);
    expect(end.getMinutes()).toBe(0);
  });
});

describe("夏期時間割・休館日", () => {
  it("2026年8月末までは曜日を問わず8:00〜22:00", () => {
    const mon = dateAt(2026, 7, 13); // 月曜
    const sun = dateAt(2026, 8, 2); // 日曜
    for (const d of [mon, sun]) {
      const { start, end } = businessHoursFor(d);
      expect(start.getHours()).toBe(8);
      expect(end.getHours()).toBe(22);
    }
  });
  it("8/11〜8/13は休館日（営業時間0分）", () => {
    for (const d of [dateAt(2026, 8, 11), dateAt(2026, 8, 12), dateAt(2026, 8, 13)]) {
      expect(isClosedDate(d)).toBe(true);
      const { start, end } = businessHoursFor(d);
      expect(end.getTime()).toBe(start.getTime());
    }
  });
  it("8/10や8/14は休館日ではない", () => {
    expect(isClosedDate(dateAt(2026, 8, 10))).toBe(false);
    expect(isClosedDate(dateAt(2026, 8, 14))).toBe(false);
  });
});

describe("科目時間と所要時間計算", () => {
  it("高3：科目合計を積み上げる", () => {
    const keys: SubjectKeyG3[] = ["kokugo", "math1a"];
    expect(subjectMinutes("g3", keys)).toBe(80 + 70);
  });
  it("高1・2：固定3科目 国語90+数学120+英語80", () => {
    const sum = subjectMinutes("g12", ["kokugo_g12", "math_g12", "eigo_g12"]);
    expect(sum).toBe(90 + 120 + 80);
  });
  it("総所要時間 = 15 + 科目合計 + 10×(科目数-1)", () => {
    expect(totalTestMinutes(150, 2)).toBe(15 + 150 + 10);
    expect(totalTestMinutes(80, 1)).toBe(15 + 80);
    expect(totalTestMinutes(0, 0)).toBe(0);
  });
});

describe("学力診断テストは1日で完結する構成のみ選択可能（繰り越し禁止）", () => {
  it("1日に収まる場合はセッションが返る", () => {
    const mon = dateAt(2026, 9, 14, 13, 0); // 通常期の月曜
    const session = computeTestSession(mon, ["kokugo", "math1a"], "g3");
    expect(session).not.toBeNull();
    expect(session!.minutesUsed).toBe(totalTestMinutes(150, 2));
  });
  it("平日の営業時間(13:00-21:30=510分)を超える科目数だとnull（選択不可）になる", () => {
    const mon = dateAt(2026, 9, 14, 13, 0);
    const keys: SubjectKeyG3[] = [
      "kokugo", "math1a", "math2bc", "eigo_reading", "physics", "chemistry", "biology", "earth_science",
    ];
    expect(canFitSubjects("g3", keys, mon)).toBe(false);
    expect(computeTestSession(mon, keys, "g3")).toBeNull();
  });
  it("来校可能時刻（18:00）で開始が後ろにずれる", () => {
    const mon = dateAt(2026, 9, 14, 13, 0);
    const session = computeTestSession(mon, ["kokugo"], "g3", { arrivalHour: 18 });
    expect(session!.startAt.getHours()).toBe(18);
  });
});

describe("2日目への振り分け（splitSubjectsForDay）", () => {
  it("1日に収まる科目はすべてfittingに入る", () => {
    const mon = dateAt(2026, 9, 14, 13, 0);
    const { fitting, overflow } = splitSubjectsForDay(["kokugo", "math1a"], "g3", mon);
    expect(fitting).toEqual(["kokugo", "math1a"]);
    expect(overflow).toEqual([]);
  });
  it("選択順に詰めて、収まらない科目はoverflowに回る", () => {
    const mon = dateAt(2026, 9, 14, 13, 0); // 510分
    const keys: SubjectKeyG3[] = [
      "kokugo", "math1a", "math2bc", "eigo_reading", "physics", "chemistry", "biology", "earth_science",
    ];
    const { fitting, overflow } = splitSubjectsForDay(keys, "g3", mon);
    expect(fitting.length).toBeGreaterThan(0);
    expect(overflow.length).toBeGreaterThan(0);
    expect([...fitting, ...overflow]).toEqual(keys);
  });
});

describe("志望校区分からの推奨科目", () => {
  it("私立文系：国語・英語リーディング＋社会1科目", () => {
    const rec = recommendBaseSubjects("private_bunkei");
    expect(rec.fixed.sort()).toEqual(["eigo_reading", "kokugo"].sort());
    expect(rec.needsShakai).toBe(true);
    expect(rec.needsRikaCount).toBe(0);
  });
  it("国立理系：国語・数学ⅠA・数学ⅡB(C)・英語リーディング＋理科", () => {
    const rec = recommendBaseSubjects("national_rikei");
    expect(rec.fixed.sort()).toEqual(["eigo_reading", "kokugo", "math1a", "math2bc"].sort());
    expect(rec.needsShakai).toBe(false);
    expect(rec.needsRikaCount).toBe(1);
  });
  it("私立理系の理科科目数：早慶以上＆履修半分以上の両方満たすときのみ2科目", () => {
    expect(recommendRikaCount("private_rikei", { aimsTopPrivate: true, halfOrMoreCovered: true })).toBe(2);
    expect(recommendRikaCount("private_rikei", { aimsTopPrivate: true, halfOrMoreCovered: false })).toBe(1);
    expect(recommendRikaCount("private_rikei", { aimsTopPrivate: false, halfOrMoreCovered: true })).toBe(1);
  });
  it("国立理系の理科科目数：履修半分以上なら2科目（早慶条件は不要）", () => {
    expect(recommendRikaCount("national_rikei", { aimsTopPrivate: false, halfOrMoreCovered: true })).toBe(2);
    expect(recommendRikaCount("national_rikei", { aimsTopPrivate: false, halfOrMoreCovered: false })).toBe(1);
  });
  it("文系は理科不要", () => {
    expect(recommendRikaCount("private_bunkei", { aimsTopPrivate: true, halfOrMoreCovered: true })).toBe(0);
  });
});

describe("初回三者面談の空き枠検出（星野カレンダーのbusyを考慮）", () => {
  const busy: BusyBlock[] = [
    { id: "b1", ownerId: "usr_aoki", startAt: dateAt(2026, 7, 13, 13, 0).toISOString(), endAt: dateAt(2026, 7, 13, 21, 30).toISOString(), label: "終日" },
  ];
  it("busyと重なる日には候補が出ない", () => {
    const after = dateAt(2026, 7, 13, 13, 0);
    const slots = generateInterviewSlots(after, busy, { daysToScan: 1 });
    expect(slots).toHaveLength(0);
  });
  it("busyがない日には90分枠の候補が出る", () => {
    const after = dateAt(2026, 7, 14, 0, 0);
    const slots = generateInterviewSlots(after, [], { daysToScan: 1 });
    expect(slots.length).toBeGreaterThan(0);
    const first = slots[0];
    expect((first.endAt.getTime() - first.startAt.getTime()) / 60000).toBe(90);
  });
  it("afterDateより前の時間帯は候補にならない", () => {
    const after = dateAt(2026, 7, 15, 18, 0);
    const slots = generateInterviewSlots(after, [], { daysToScan: 1 });
    for (const s of slots) {
      expect(s.startAt.getTime()).toBeGreaterThanOrEqual(after.getTime());
    }
  });
});
