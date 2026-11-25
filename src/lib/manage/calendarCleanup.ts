import "server-only";
import { deleteCalendarEvent } from "@/lib/google/calendarEvents";

// 予約フォームが作ったGoogleカレンダーの予定を片付ける。取消・日程変更・生徒削除で予定だけが残り、
// 面談枠がふさがったまま（公開側の空き判定に影響）になるのを防ぐ。失敗しても本処理は止めない（deleteCalendarEvent は例外を投げない）。
export async function removeCalendarEvents(rows: { kind: unknown; google_event_id: unknown }[]): Promise<void> {
  for (const r of rows) {
    if (typeof r.google_event_id !== "string" || !r.google_event_id) continue;
    await deleteCalendarEvent(r.kind === "test" ? "test" : "interview", r.google_event_id);
  }
}
