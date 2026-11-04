import { RAW_TYPE_LABELS } from "@/lib/booking/logic";
import type { StageState } from "./intake";

export const CONTACT_RESULT_LABELS: Record<string, string> = {
  none: "未連絡",
  no_answer: "不通",
  connected: "接続",
  callback_wait: "折返し待ち",
  other: "その他",
};

export const STAGE_LABELS: Record<StageState, string> = {
  na: "対象外",
  unscheduled: "未予約",
  booked: "予約済・未実施",
  done: "実施済",
  absent: "欠席・要再調整",
};

// 予約フォームの種別に加え、メール取込でのみ入る種別（全国統一高校生テスト等）の表示名
export const MANAGE_TYPE_LABELS: Record<string, string> = {
  ...RAW_TYPE_LABELS,
  national_test: "全国統一高校生テスト",
  common_test_trial: "共通テスト体験受験",
};

export const CHANNEL_LABELS: Record<string, string> = {
  form: "フォーム",
  mail: "メール",
  phone: "電話",
  visit: "来校",
  referral: "紹介",
};

export const FILTER_LABELS: Record<string, string> = {
  all: "すべて(面談前)",
  uncontacted: "未連絡",
  no_answer: "不通・折返し待ち",
  test_unscheduled: "テスト日程未確定",
  interview_unscheduled: "面談日程未確定",
  booked_pending: "予約済・未実施",
  absent: "欠席・要再調整",
  history: "面談完了(履歴)",
};

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}
