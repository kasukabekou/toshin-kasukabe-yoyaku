// 予約ページ（学力診断テスト・初回三者面談）の業務ロジック。
// 純関数のみ。React/DBには依存しない。
import type {
  GradeGroup, SubjectKey, SubjectKeyG3, SubjectKeyG12,
  BusyBlock, ApplicationRawType, ApplicationPattern,
} from "../types";

// --- 営業時間 ---
export const BUSINESS_HOURS = {
  weekday: { startHour: 13, startMin: 0, endHour: 21, endMin: 30 },
  sat: { startHour: 10, startMin: 0, endHour: 21, endMin: 30 },
  sun: { startHour: 10, startMin: 0, endHour: 19, endMin: 0 },
} as const;

// 季節ごとの特別営業時間・休館日。シーズンが変わるたびに更新が必要。
// 2026年夏期時間割：曜日を問わず8:00〜22:00（〜8/31）。8/11〜8/13は休館日。
const SPECIAL_HOURS_RANGES: { start: string; end: string; startHour: number; startMin: number; endHour: number; endMin: number }[] = [
  { start: "2026-01-01", end: "2026-08-31", startHour: 8, startMin: 0, endHour: 22, endMin: 0 },
];
const CLOSED_DATES = ["2026-08-11", "2026-08-12", "2026-08-13"];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isClosedDate(date: Date): boolean {
  return CLOSED_DATES.includes(dateKey(date));
}

export function businessHoursFor(date: Date): { start: Date; end: Date } {
  if (isClosedDate(date)) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date(start) }; // 休館日：営業時間0分
  }

  const key = dateKey(date);
  const special = SPECIAL_HOURS_RANGES.find((r) => key >= r.start && key <= r.end);
  if (special) {
    const start = new Date(date);
    start.setHours(special.startHour, special.startMin, 0, 0);
    const end = new Date(date);
    end.setHours(special.endHour, special.endMin, 0, 0);
    return { start, end };
  }

  const day = date.getDay(); // 0=日 1=月 ... 6=土
  const rule = day === 0 ? BUSINESS_HOURS.sun : day === 6 ? BUSINESS_HOURS.sat : BUSINESS_HOURS.weekday;
  const start = new Date(date);
  start.setHours(rule.startHour, rule.startMin, 0, 0);
  const end = new Date(date);
  end.setHours(rule.endHour, rule.endMin, 0, 0);
  return { start, end };
}

// --- 申込パターン ---
const PATTERN_BY_RAW_TYPE: Record<ApplicationRawType, ApplicationPattern> = {
  special_invite: "C",
  document_request: "C",
  trial_day: "C",
  week_intensive_trial: "C",
  briefing: "B",
  school_course_briefing: "B",
  open_class: "A",
};

export const RAW_TYPE_LABELS: Record<ApplicationRawType, string> = {
  special_invite: "特別招待講習",
  document_request: "資料請求",
  briefing: "個別説明会",
  school_course_briefing: "高校対応別指導コース個別説明会",
  open_class: "特別公開授業",
  trial_day: "1日体験",
  week_intensive_trial: "1週間集中体験",
};

export function patternForRawType(raw: ApplicationRawType): ApplicationPattern {
  return PATTERN_BY_RAW_TYPE[raw];
}

export function requiresTest(pattern: ApplicationPattern): boolean {
  return pattern === "C";
}

export function requiresInterview(pattern: ApplicationPattern): boolean {
  return pattern === "B" || pattern === "C";
}

// ヒアリング項目⑧は パターンC のみ表示（パターンBは①〜⑦,⑨のみ）
export function showsHearingItem8(pattern: ApplicationPattern): boolean {
  return pattern === "C";
}

export const HEARING_ITEM_LABELS = {
  item1: "①申し込みのきっかけ・理由",
  item2: "②現在の進路（文系or理系・志望校・学部学科／未定なら「未定」）",
  item3: "③（②が未定の場合）志望大学のランク帯",
  item4: "④得意科目分野・苦手科目分野",
  item5: "⑤部活動と活動頻度",
  item6: "⑥直近模試・定期テストの成績（例：河合模試 偏差値55(英語) / 定期テスト 英語75点）",
  item7: "⑦受験勉強を進める上での悩み・課題",
  item8: "⑧招待講習・体験・個別指導を受ける上で相談したいこと",
  item9: "⑨特記事項・校舎に伝えておきたいこと",
} as const;

// --- 科目時間テーブル ---
export const SUBJECT_TIMES_G3: Record<SubjectKeyG3, number> = {
  kokugo: 80, math1a: 70, math2bc: 60, eigo_reading: 80,
  physics: 60, chemistry: 60, biology: 60, earth_science: 60,
  japanese_history: 60, world_history: 60, geography: 60, ethics_politics: 60,
};

export const SUBJECT_TIMES_G12: Record<SubjectKeyG12, number> = {
  kokugo_g12: 90, math_g12: 120, eigo_g12: 80,
};

export const SUBJECT_LABELS: Record<SubjectKey, string> = {
  kokugo: "国語", math1a: "数学ⅠA", math2bc: "数学ⅡB(C)", eigo_reading: "英語リーディング",
  physics: "物理", chemistry: "化学", biology: "生物", earth_science: "地学",
  japanese_history: "日本史", world_history: "世界史", geography: "地理", ethics_politics: "倫理政経",
  kokugo_g12: "国語", math_g12: "数学", eigo_g12: "英語",
};

function subjectTimeTable(gradeGroup: GradeGroup): Record<string, number> {
  return gradeGroup === "g3" ? SUBJECT_TIMES_G3 : SUBJECT_TIMES_G12;
}

export function subjectMinutes(gradeGroup: GradeGroup, subjectKeys: SubjectKey[]): number {
  const table = subjectTimeTable(gradeGroup);
  return subjectKeys.reduce((sum, key) => sum + (table[key] ?? 0), 0);
}

// 総所要時間 = カウンセリング15分 + 科目合計時間 + 休憩10分×(科目数-1)
export function totalTestMinutes(subjectMinutesSum: number, subjectCount: number): number {
  if (subjectCount === 0) return 0;
  return 15 + subjectMinutesSum + 10 * (subjectCount - 1);
}

// --- 学力診断テスト：その日の来校可能時刻を起点に、収まる科目・あふれる科目に分ける ---
// 「来校可能時刻」は曜日を問わず、指定した日にその時刻から来校できることを表す
// （以前の「平日のみ」制約は廃止。受験日と来校可能時刻は常にセットで指定する）。
export interface ArrivalConstraint {
  arrivalHour: number;
  arrivalMin?: number;
}

export interface TestSession {
  date: Date;
  startAt: Date;
  endAt: Date;
  minutesUsed: number;
}

function clipStartForConstraint(date: Date, start: Date, constraint?: ArrivalConstraint): Date {
  if (!constraint) return start;
  const clipped = new Date(date);
  clipped.setHours(constraint.arrivalHour, constraint.arrivalMin ?? 0, 0, 0);
  return clipped > start ? clipped : start;
}

// その日、来校可能時刻から閉館までに使える分数
export function testDayWindowMinutes(date: Date, constraint?: ArrivalConstraint): number {
  const { start, end } = businessHoursFor(date);
  const dayStart = clipStartForConstraint(date, start, constraint);
  return Math.max(0, (end.getTime() - dayStart.getTime()) / 60000);
}

// 指定科目群がその日1日（営業時間内・来校可能時刻考慮）に収まるか
export function canFitSubjects(
  gradeGroup: GradeGroup,
  subjectKeys: SubjectKey[],
  date: Date,
  constraint?: ArrivalConstraint
): boolean {
  if (subjectKeys.length === 0) return true;
  const total = totalTestMinutes(subjectMinutes(gradeGroup, subjectKeys), subjectKeys.length);
  return total <= testDayWindowMinutes(date, constraint);
}

// 1日で完結するテストセッションを計算する。収まらない場合は null（＝選択不可）。
export function computeTestSession(
  date: Date,
  orderedSubjectKeys: SubjectKey[],
  gradeGroup: GradeGroup,
  constraint?: ArrivalConstraint
): TestSession | null {
  if (orderedSubjectKeys.length === 0) return null;
  if (!canFitSubjects(gradeGroup, orderedSubjectKeys, date, constraint)) return null;

  const { start } = businessHoursFor(date);
  const dayStart = clipStartForConstraint(date, start, constraint);
  const minutesUsed = totalTestMinutes(subjectMinutes(gradeGroup, orderedSubjectKeys), orderedSubjectKeys.length);
  const endAt = new Date(dayStart.getTime() + minutesUsed * 60000);
  return { date: new Date(date), startAt: dayStart, endAt, minutesUsed };
}

// 選択順に科目を1日目の枠へ詰め、収まる科目とあふれる科目に分ける（繰り越しは自動で行わず、
// あふれた科目は2日目として本人に別途日時を指定してもらう想定）。
export function splitSubjectsForDay(
  orderedSubjectKeys: SubjectKey[],
  gradeGroup: GradeGroup,
  date: Date,
  constraint?: ArrivalConstraint
): { fitting: SubjectKey[]; overflow: SubjectKey[] } {
  const windowMinutes = testDayWindowMinutes(date, constraint);
  const fitting: SubjectKey[] = [];
  const overflow: SubjectKey[] = [];
  for (const key of orderedSubjectKeys) {
    const candidate = [...fitting, key];
    const total = totalTestMinutes(subjectMinutes(gradeGroup, candidate), candidate.length);
    if (total <= windowMinutes) fitting.push(key);
    else overflow.push(key);
  }
  return { fitting, overflow };
}

// --- 志望校区分に応じた推奨科目 ---
export type CourseType = "private_bunkei" | "private_rikei" | "national_bunkei" | "national_rikei";

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  private_bunkei: "私立文系",
  private_rikei: "私立理系",
  national_bunkei: "国公立文系",
  national_rikei: "国公立理系",
};

export interface SubjectRecommendation {
  fixed: SubjectKeyG3[]; // 自動選択される固定科目
  needsShakai: boolean; // 社会1科目を本人に選ばせる必要があるか
  needsRikaCount: 0 | 1 | 2; // 理科を本人に何科目選ばせる必要があるか（0=不要）
}

// 固定科目は自動選択、社会・理科の具体的な1科目（理科は1〜2科目）は本人にしか判断できないため自動選択しない
export function recommendBaseSubjects(courseType: CourseType): SubjectRecommendation {
  switch (courseType) {
    case "private_bunkei":
      return { fixed: ["kokugo", "eigo_reading"], needsShakai: true, needsRikaCount: 0 };
    case "private_rikei":
      return { fixed: ["eigo_reading", "math1a", "math2bc"], needsShakai: false, needsRikaCount: 1 };
    case "national_bunkei":
      return { fixed: ["kokugo", "math1a", "math2bc", "eigo_reading"], needsShakai: true, needsRikaCount: 0 };
    case "national_rikei":
      return { fixed: ["kokugo", "math1a", "math2bc", "eigo_reading"], needsShakai: false, needsRikaCount: 1 };
  }
}

// 理科の必要科目数（1 or 2）。私立理系は「早慶以上志望」かつ「履修半分以上」の両方を満たす場合のみ2科目、
// 国公立理系は「履修半分以上」のみで2科目（早慶条件は私立のみ）。文系はそもそも理科不要（0）。
export function recommendRikaCount(
  courseType: CourseType,
  opts: { aimsTopPrivate: boolean; halfOrMoreCovered: boolean }
): 0 | 1 | 2 {
  if (courseType === "private_bunkei" || courseType === "national_bunkei") return 0;
  if (courseType === "private_rikei") {
    return opts.aimsTopPrivate && opts.halfOrMoreCovered ? 2 : 1;
  }
  // national_rikei
  return opts.halfOrMoreCovered ? 2 : 1;
}

// --- 初回三者面談：星野カレンダー（busy）を考慮した空き枠検出 ---
export const INTERVIEW_MINUTES = 90;

// 面談は校舎の営業時間帯とは切り離し、担当者の負担を考慮して10:00〜21:30の固定枠から選べるようにする。
// 休館日はテスト等と同様に対応不可（0分）とする。
function interviewHoursFor(date: Date): { start: Date; end: Date } {
  if (isClosedDate(date)) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date(start) };
  }
  const start = new Date(date);
  start.setHours(10, 0, 0, 0);
  const end = new Date(date);
  end.setHours(21, 30, 0, 0);
  return { start, end };
}

export interface InterviewSlot {
  startAt: Date;
  endAt: Date;
}

export function generateInterviewSlots(
  afterDate: Date | null,
  busyBlocks: BusyBlock[],
  opts?: { daysToScan?: number; gridMinutes?: number }
): InterviewSlot[] {
  const daysToScan = opts?.daysToScan ?? 14;
  const gridMinutes = opts?.gridMinutes ?? 15;
  const slots: InterviewSlot[] = [];
  const scanStart = afterDate ? new Date(afterDate) : new Date();

  for (let d = 0; d < daysToScan; d++) {
    const day = new Date(scanStart);
    day.setDate(day.getDate() + d);
    day.setHours(0, 0, 0, 0);
    const { start, end } = interviewHoursFor(day);

    const dayEarliest = d === 0 && afterDate && afterDate.getTime() > start.getTime() ? afterDate : start;
    const cursorStart = new Date(dayEarliest);
    const rem = cursorStart.getMinutes() % gridMinutes;
    if (rem !== 0) cursorStart.setMinutes(cursorStart.getMinutes() + (gridMinutes - rem), 0, 0);

    let cursor = cursorStart;
    while (cursor.getTime() + INTERVIEW_MINUTES * 60000 <= end.getTime()) {
      const slotEnd = new Date(cursor.getTime() + INTERVIEW_MINUTES * 60000);
      const overlaps = busyBlocks.some((b) => {
        const bs = new Date(b.startAt).getTime();
        const be = new Date(b.endAt).getTime();
        return cursor.getTime() < be && slotEnd.getTime() > bs;
      });
      if (!overlaps) slots.push({ startAt: new Date(cursor), endAt: slotEnd });
      cursor = new Date(cursor.getTime() + gridMinutes * 60000);
    }
  }
  return slots;
}
