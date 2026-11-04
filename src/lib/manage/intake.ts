// 「申込〜初回三者面談」画面の状態判定（純粋関数）。
// 電話・テスト・面談は別々の状態として持ち、1つのステータスに押し込まない。
// 日時が過ぎただけでは「実施済」にしない（実績=outcome が記録されて初めて実施済）。

export type ContactResult = "no_answer" | "connected" | "callback_wait" | "other";
export type OutcomeResult = "done" | "absent" | "cancelled";

export interface IntakeAppointment {
  id: string;
  kind: string; // 'test' | 'interview' ほか
  startAt: string;
  status: string; // 'booked' | 'rescheduled' | 'cancelled'
  assignedStaffId: string | null;
}
export interface IntakeOutcome {
  appointmentId: string | null;
  result: OutcomeResult;
}
export interface IntakeTask {
  status: string;
  assignedStaffId: string | null;
  dueOn: string | null;
}
export interface IntakeInput {
  testRequired: boolean;
  interviewRequired: boolean;
  lastContact: { result: ContactResult; contactedAt: string } | null;
  appointments: IntakeAppointment[];
  outcomes: IntakeOutcome[];
  tasks: IntakeTask[];
  today: string; // JSTの YYYY-MM-DD
}

// 'na'=対象外（未完了扱いにしない） / 'unscheduled'=未予約 / 'booked'=予約済・未実施 / 'done' / 'absent'（欠席・要再調整）
export type StageState = "na" | "unscheduled" | "booked" | "done" | "absent";

export function stageState(kind: "test" | "interview", required: boolean, input: IntakeInput): StageState {
  const appts = input.appointments.filter((a) => a.kind === kind);
  const outcomeOf = (id: string) => input.outcomes.find((o) => o.appointmentId === id);
  const done = appts.some((a) => outcomeOf(a.id)?.result === "done");
  if (done) return "done";
  const active = appts.filter((a) => a.status === "booked" && !outcomeOf(a.id));
  if (active.length > 0) return "booked";
  const absent = appts.some((a) => outcomeOf(a.id)?.result === "absent");
  if (absent) return "absent";
  return required ? "unscheduled" : "na";
}

export type IntakeFilter =
  | "all" | "uncontacted" | "no_answer" | "test_unscheduled" | "interview_unscheduled" | "booked_pending" | "absent" | "history";

export interface IntakeStatus {
  test: StageState;
  interview: StageState;
  contact: "none" | ContactResult;
  noNextTask: boolean; // 未完了の次の対応が1件もない
  taskUnassigned: boolean;
  taskNoDue: boolean;
  taskOverdue: boolean;
  completed: boolean; // 初回三者面談が実施済み＝体験中の管理へ引き継ぐ
}

export function deriveIntakeStatus(input: IntakeInput): IntakeStatus {
  const test = stageState("test", input.testRequired, input);
  const interview = stageState("interview", input.interviewRequired, input);
  const open = input.tasks.filter((t) => t.status === "todo" || t.status === "doing");
  return {
    test,
    interview,
    contact: input.lastContact?.result ?? "none",
    noNextTask: open.length === 0,
    taskUnassigned: open.some((t) => !t.assignedStaffId),
    taskNoDue: open.some((t) => !t.dueOn),
    taskOverdue: open.some((t) => t.dueOn && t.dueOn < input.today),
    completed: interview === "done",
  };
}

export function matchesFilter(s: IntakeStatus, f: IntakeFilter): boolean {
  if (f === "history") return s.completed;
  if (s.completed) return false; // 通常一覧は面談前を優先。完了者は履歴フィルターで見る
  switch (f) {
    case "all": return true;
    case "uncontacted": return s.contact === "none";
    case "no_answer": return s.contact === "no_answer" || s.contact === "callback_wait";
    case "test_unscheduled": return s.test === "unscheduled";
    case "interview_unscheduled": return s.interview === "unscheduled";
    case "booked_pending": return s.test === "booked" || s.interview === "booked";
    case "absent": return s.test === "absent" || s.interview === "absent";
  }
}
