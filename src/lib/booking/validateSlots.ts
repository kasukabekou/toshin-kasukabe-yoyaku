// 送信された予約時刻のサーバー側検証。画面側の枠計算を経ずに細工したリクエストで
// 深夜・過去・休館日・任意の長さの予約を確定させないための最低限の範囲チェック。
// 細かい空き判定は画面側の枠計算とカレンダー再確認・DB制約が担う。
import { INTERVIEW_MINUTES, isClosedDateKey } from "./logic";
import { jstDateKey, jstParts } from "../datetime/jst";

interface Range {
  startAt: string;
  endAt: string;
}

const INTERVIEW_WINDOW = { start: 10 * 60, end: 21 * 60 + 30 }; // 面談の固定枠 10:00〜21:30
const TEST_WINDOW = { start: 8 * 60, end: 22 * 60 }; // 営業時間の最大幅（特別時間割を含む）
const INTERVIEW_GRID_MINUTES = 15;

function minutesOfDay(iso: string): number {
  const p = jstParts(iso);
  return p.hour * 60 + p.minute;
}

function checkRange(r: Range, now: Date, window: { start: number; end: number }): string | null {
  const start = Date.parse(r.startAt);
  const end = Date.parse(r.endAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return "invalid_datetime";
  if (end <= start) return "invalid_range";
  if (start <= now.getTime()) return "past_datetime";
  if (jstDateKey(r.startAt) !== jstDateKey(r.endAt)) return "crosses_day";
  if (isClosedDateKey(jstDateKey(r.startAt))) return "closed_date";
  if (minutesOfDay(r.startAt) < window.start || minutesOfDay(r.endAt) > window.end) return "outside_hours";
  return null;
}

export function validateInterviewSlot(slot: Range, now: Date = new Date()): string | null {
  const err = checkRange(slot, now, INTERVIEW_WINDOW);
  if (err) return err;
  if (Date.parse(slot.endAt) - Date.parse(slot.startAt) !== INTERVIEW_MINUTES * 60000) return "invalid_duration";
  if (minutesOfDay(slot.startAt) % INTERVIEW_GRID_MINUTES !== 0) return "off_grid";
  return null;
}

export function validateTestSegments(segments: (Range & { dayIndex: number })[], now: Date = new Date()): string | null {
  const dayIndexes = new Set<number>();
  for (const seg of segments) {
    const err = checkRange(seg, now, TEST_WINDOW);
    if (err) return err;
    if (dayIndexes.has(seg.dayIndex)) return "duplicate_day_index";
    dayIndexes.add(seg.dayIndex);
  }
  return null;
}
