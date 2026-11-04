import { describe, expect, it } from "vitest";
import { deriveIntakeStatus, matchesFilter, type IntakeInput } from "./intake";

const base: IntakeInput = {
  testRequired: true,
  interviewRequired: true,
  lastContact: null,
  appointments: [],
  outcomes: [],
  tasks: [],
  today: "2026-11-01",
};
const appt = (id: string, kind: string, status = "booked") => ({ id, kind, startAt: "2026-10-01T00:00:00Z", status, assignedStaffId: null });

describe("deriveIntakeStatus", () => {
  it("不通でもフォームで面談予約済みなら、電話と面談を別々に表せる", () => {
    const s = deriveIntakeStatus({ ...base, lastContact: { result: "no_answer", contactedAt: "x" }, appointments: [appt("a", "interview")] });
    expect(s.contact).toBe("no_answer");
    expect(s.interview).toBe("booked");
    expect(s.test).toBe("unscheduled");
  });
  it("日時が過ぎても実績がなければ実施済にならない", () => {
    expect(deriveIntakeStatus({ ...base, appointments: [appt("a", "interview")] }).interview).toBe("booked");
  });
  it("実績 done で実施済、absent で欠席・要再調整", () => {
    const done = deriveIntakeStatus({ ...base, appointments: [appt("a", "interview")], outcomes: [{ appointmentId: "a", result: "done" }] });
    expect(done.interview).toBe("done");
    expect(done.completed).toBe(true);
    const absent = deriveIntakeStatus({ ...base, appointments: [appt("a", "interview")], outcomes: [{ appointmentId: "a", result: "absent" }] });
    expect(absent.interview).toBe("absent");
  });
  it("欠席後に再予約すると予約済に戻る。日程変更済の旧予約は数えない", () => {
    const s = deriveIntakeStatus({
      ...base,
      appointments: [appt("a", "interview", "rescheduled"), appt("b", "interview")],
    });
    expect(s.interview).toBe("booked");
  });
  it("テスト不要の種別は対象外で、未完了扱いにしない", () => {
    const s = deriveIntakeStatus({ ...base, testRequired: false });
    expect(s.test).toBe("na");
    expect(matchesFilter(s, "test_unscheduled")).toBe(false);
  });
  it("次の対応の不足を検出する", () => {
    const none = deriveIntakeStatus(base);
    expect(none.noNextTask).toBe(true);
    const t = deriveIntakeStatus({ ...base, tasks: [{ status: "todo", assignedStaffId: null, dueOn: "2026-10-31" }] });
    expect(t.noNextTask).toBe(false);
    expect(t.taskUnassigned).toBe(true);
    expect(t.taskOverdue).toBe(true);
    const closed = deriveIntakeStatus({ ...base, tasks: [{ status: "done", assignedStaffId: null, dueOn: null }] });
    expect(closed.taskUnassigned).toBe(false);
  });
  it("面談実施済みは通常一覧から外れ、履歴フィルターにだけ出る", () => {
    const s = deriveIntakeStatus({ ...base, appointments: [appt("a", "interview")], outcomes: [{ appointmentId: "a", result: "done" }] });
    expect(matchesFilter(s, "all")).toBe(false);
    expect(matchesFilter(s, "history")).toBe(true);
  });
});
