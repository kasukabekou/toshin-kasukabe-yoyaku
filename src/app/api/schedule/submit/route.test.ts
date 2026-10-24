import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// supabaseAdmin の簡易フェイク。テーブル・操作ごとの結果を差し替え、呼び出し順を記録する。
const db = vi.hoisted(() => ({
  results: {} as Record<string, { error: { code?: string; message: string } | null }>,
  calls: [] as string[],
}));
vi.mock("@/lib/supabase/adminClient", () => {
  function builder(table: string) {
    let op = "select";
    const b: Record<string, unknown> = {};
    for (const m of ["upsert", "insert", "delete", "update"]) {
      b[m] = () => {
        op = m;
        db.calls.push(`${table}.${m}`);
        return b;
      };
    }
    for (const m of ["eq", "in", "is", "select"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => void) => resolve(db.results[`${table}.${op}`] ?? { error: null });
    return b;
  }
  return { supabaseAdmin: { from: (table: string) => builder(table) } };
});

const mocks = vi.hoisted(() => ({
  resolveScheduleToken: vi.fn(),
  claimScheduleToken: vi.fn(),
  releaseScheduleToken: vi.fn(),
  isGoogleCalendarConfigured: vi.fn(),
  isSlotStillFree: vi.fn(),
  insertInterviewEvent: vi.fn(),
  isTestCalendarConfigured: vi.fn(),
  insertTestEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendStaffNotificationEmail: vi.fn(),
  sendLineNotification: vi.fn(),
}));
vi.mock("@/lib/schedule/resolveToken", () => ({ resolveScheduleToken: mocks.resolveScheduleToken }));
vi.mock("@/lib/schedule/claimToken", () => ({
  claimScheduleToken: mocks.claimScheduleToken,
  releaseScheduleToken: mocks.releaseScheduleToken,
}));
vi.mock("@/lib/google/calendarClient", () => ({ isGoogleCalendarConfigured: mocks.isGoogleCalendarConfigured }));
vi.mock("@/lib/google/calendarEvents", () => ({
  isSlotStillFree: mocks.isSlotStillFree,
  insertInterviewEvent: mocks.insertInterviewEvent,
  isTestCalendarConfigured: mocks.isTestCalendarConfigured,
  insertTestEvent: mocks.insertTestEvent,
  deleteCalendarEvent: mocks.deleteCalendarEvent,
}));
vi.mock("@/lib/email/sendConfirmation", () => ({
  sendApplicationConfirmationEmail: mocks.sendApplicationConfirmationEmail,
  sendStaffNotificationEmail: mocks.sendStaffNotificationEmail,
}));
vi.mock("@/lib/line/sendLineNotification", () => ({ sendLineNotification: mocks.sendLineNotification }));

import { POST } from "./route";

const hearing = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`item${i + 1}`, ""]));
// 十分先の日付（2099-10-05 月曜 14:00〜15:30 JST / 13:00〜17:00 JST）
const interviewSlot = { startAt: "2099-10-05T05:00:00.000Z", endAt: "2099-10-05T06:30:00.000Z" };
const testSegment = { startAt: "2099-10-06T04:00:00.000Z", endAt: "2099-10-06T08:00:00.000Z", dayIndex: 0, subjects: ["eng"] };

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/schedule/submit", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const baseBody = { token: "tok", hearing, selectedSubjects: ["eng"], testSegments: [testSegment], interviewSlot };

beforeEach(() => {
  vi.clearAllMocks();
  db.results = {};
  db.calls = [];
  mocks.resolveScheduleToken.mockResolvedValue({
    applicationId: "app_1",
    usedAt: null,
    application: {
      name: "テスト", phone: "000", email: "a@example.com", school: "高校", grade: "高3",
      rawType: "special_invite", pattern: "C", gradeGroup: "g3",
    },
  });
  mocks.claimScheduleToken.mockResolvedValue(true);
  mocks.isGoogleCalendarConfigured.mockReturnValue(true);
  mocks.isTestCalendarConfigured.mockReturnValue(true);
  mocks.isSlotStillFree.mockResolvedValue(true);
  mocks.insertInterviewEvent.mockResolvedValue("ev_interview");
  mocks.insertTestEvent.mockResolvedValue("ev_test");
});

describe("POST /api/schedule/submit", () => {
  it("正常時は予約行をカレンダーより先に登録し、通知を送る", async () => {
    const res = await POST(request(baseBody));
    expect(res.status).toBe(200);
    expect(db.calls).toContain("schedule_appointments.insert");
    expect(mocks.insertInterviewEvent).toHaveBeenCalledTimes(1);
    expect(mocks.insertTestEvent).toHaveBeenCalledTimes(1);
    expect(mocks.releaseScheduleToken).not.toHaveBeenCalled();
    expect(mocks.sendLineNotification).toHaveBeenCalledTimes(1);
  });

  it("トークンを確保できなければ（並行送信）何も作らず409を返す", async () => {
    mocks.claimScheduleToken.mockResolvedValue(false);
    const res = await POST(request(baseBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_submitted");
    expect(db.calls).toEqual([]);
    expect(mocks.insertInterviewEvent).not.toHaveBeenCalled();
    expect(mocks.sendApplicationConfirmationEmail).not.toHaveBeenCalled();
  });

  it("DBの排他制約で面談が弾かれたら、カレンダーに作らずトークンを戻して409を返す", async () => {
    db.results["schedule_appointments.insert"] = { error: { code: "23P01", message: "conflicting key value" } };
    const res = await POST(request(baseBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("interview_slot_taken");
    expect(mocks.insertInterviewEvent).not.toHaveBeenCalled();
    expect(mocks.releaseScheduleToken).toHaveBeenCalledWith("tok");
  });

  it("カレンダー登録が途中で失敗したら、作成済みの予定と予約行を取り消してトークンを戻す", async () => {
    mocks.insertTestEvent.mockRejectedValue(new Error("calendar down"));
    const res = await POST(request(baseBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("submit_failed");
    expect(JSON.stringify(json)).not.toContain("calendar down");
    expect(mocks.deleteCalendarEvent).toHaveBeenCalledWith("interview", "ev_interview");
    expect(db.calls).toContain("schedule_appointments.delete");
    expect(mocks.releaseScheduleToken).toHaveBeenCalledWith("tok");
    expect(mocks.sendLineNotification).not.toHaveBeenCalled();
  });

  it("DBエラーの内容をクライアントに返さない", async () => {
    db.results["schedule_hearing_answers.upsert"] = { error: { message: "relation schedule_hearing_answers ..." } };
    const res = await POST(request(baseBody));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("relation");
    expect(mocks.releaseScheduleToken).toHaveBeenCalledWith("tok");
  });

  it("面談枠が既に埋まっていれば409を返す", async () => {
    mocks.isSlotStillFree.mockResolvedValue(false);
    const res = await POST(request(baseBody));
    expect(res.status).toBe(409);
    expect(db.calls).not.toContain("schedule_appointments.insert");
    expect(mocks.releaseScheduleToken).toHaveBeenCalledWith("tok");
  });

  it("営業時間外など不正な時刻はトークン確保前に400で拒否する", async () => {
    const res = await POST(
      request({ ...baseBody, interviewSlot: { startAt: "2099-10-04T17:00:00.000Z", endAt: "2099-10-04T18:30:00.000Z" } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_slot");
    expect(mocks.claimScheduleToken).not.toHaveBeenCalled();
  });
});
