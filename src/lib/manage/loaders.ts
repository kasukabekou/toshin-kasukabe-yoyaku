import "server-only";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import {
  deriveIntakeStatus,
  type ContactResult,
  type IntakeStatus,
  type OutcomeResult,
} from "./intake";

export function jstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface IntakeRow {
  studentId: string;
  name: string;
  nameKana: string;
  school: string;
  grade: string;
  appliedAt: string;
  rawType: string;
  channel: string;
  eventName: string | null;
  primaryStaffId: string | null;
  enrolled: boolean;
  applicationId: string | null;
  lastContact: { result: ContactResult; contactedAt: string; staffId: string | null; content: string } | null;
  test: { id: string; startAt: string; assignedStaffId: string | null } | null;
  interview: { id: string; startAt: string; assignedStaffId: string | null } | null;
  openTasks: { id: string; content: string; assignedStaffId: string | null; dueOn: string | null }[];
  status: IntakeStatus;
}

// 取得上限の対策：PostgREST は1回で最大1000行しか返さず、.in() に大量のIDを渡すとURLが長すぎて失敗する。
// IDを小分けにし、各回もページ分割して全件取得する。
const ID_CHUNK = 100;
const PAGE = 1000;
type Rows = Record<string, unknown>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryMod = (q: any) => any;

async function selectIn(table: string, columns: string, column: string, ids: string[], mod: QueryMod = (q) => q): Promise<{ data: Rows; error: { message: string } | null }> {
  const out: Rows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await mod(supabaseAdmin.from(table).select(columns).in(column, chunk)).order("id").range(from, from + PAGE - 1); // idで順序を安定させる（ページ境界の重複・欠落防止）
      if (error) return { data: [], error };
      out.push(...((data ?? []) as Rows));
      if ((data ?? []).length < PAGE) break;
    }
  }
  return { data: out, error: null };
}

export async function loadIntakeRows(): Promise<{ rows: IntakeRow[]; error?: string }> {
  // 生徒は全件を取得する（以前は新しい500人で打ち切っており、増えると古い申込が画面から消えていた）
  const students: Rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("schedule_students")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    students.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const ids = students.map((s) => s.id as string);
  const byDesc = (col: string): QueryMod => (q) => q.order(col, { ascending: false });
  const [enr, appts, outs, logs, tasks, settings, events, profiles] = await Promise.all([
    selectIn("schedule_enrollments", "*", "student_id", ids, byDesc("created_at")),
    selectIn("schedule_appointments", "*", "student_id", ids, (q) => q.order("start_at")),
    selectIn("schedule_outcomes", "student_id, appointment_id, result", "student_id", ids),
    selectIn("schedule_contact_logs", "*", "student_id", ids, byDesc("contacted_at")),
    selectIn("schedule_tasks", "*", "student_id", ids, (q) => q.in("status", ["todo", "doing"])),
    supabaseAdmin.from("schedule_type_settings").select("*"),
    supabaseAdmin.from("schedule_events").select("id, name"),
    selectIn("schedule_student_profiles", "student_id", "student_id", ids, (q) => q.eq("enrollment_status", "enrolled")),
  ]);
  const err = [enr, appts, outs, logs, tasks, settings, events, profiles].find((r) => r.error)?.error;
  if (err) return { rows: [], error: err.message };

  const group = <T extends Record<string, unknown>>(rows: T[] | null, key: string) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const k = r[key] as string;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const enrBy = group(enr.data, "student_id");
  const apptBy = group(appts.data, "student_id");
  const outBy = group(outs.data, "student_id");
  const logBy = group(logs.data, "student_id");
  const taskBy = group(tasks.data, "student_id");
  const settingBy = new Map((settings.data ?? []).map((s) => [s.raw_type as string, s]));
  const eventBy = new Map((events.data ?? []).map((e) => [e.id as string, e.name as string]));
  const enrolledIds = new Set((profiles.data ?? []).map((p) => p.student_id as string));
  const today = jstToday();

  const all: IntakeRow[] = students.map((s) => {
    const sid = s.id as string;
    const e = enrBy.get(sid)?.[0];
    const rawType = (e?.raw_type as string) ?? "";
    const setting = settingBy.get(rawType);
    const appointments = (apptBy.get(sid) ?? []).map((a) => ({
      id: a.id as string,
      kind: a.kind as string,
      startAt: a.start_at as string,
      status: a.status as string,
      assignedStaffId: (a.assigned_staff_id as string | null) ?? null,
    }));
    const outcomes = (outBy.get(sid) ?? []).map((o) => ({ appointmentId: (o.appointment_id as string | null) ?? null, result: o.result as OutcomeResult }));
    const log = logBy.get(sid)?.[0];
    const lastContact = log ? { result: log.result as ContactResult, contactedAt: log.contacted_at as string, staffId: (log.staff_id as string | null) ?? null, content: (log.content as string) ?? "" } : null;
    const open = (taskBy.get(sid) ?? []).map((t) => ({
      id: t.id as string,
      content: t.content as string,
      assignedStaffId: (t.assigned_staff_id as string | null) ?? null,
      dueOn: (t.due_on as string | null) ?? null,
    }));
    const status = deriveIntakeStatus({
      testRequired: Boolean(setting?.test_required),
      interviewRequired: Boolean(setting?.interview_required),
      lastContact: lastContact && { result: lastContact.result, contactedAt: lastContact.contactedAt },
      appointments,
      outcomes,
      tasks: open.map((t) => ({ status: "todo", assignedStaffId: t.assignedStaffId, dueOn: t.dueOn })),
      today,
    });
    const upcoming = (kind: string) => {
      const a = appointments.find((x) => x.kind === kind && x.status === "booked");
      return a ? { id: a.id, startAt: a.startAt, assignedStaffId: a.assignedStaffId } : null;
    };
    return {
      studentId: sid,
      name: s.name as string,
      nameKana: (s.name_kana as string) ?? "",
      school: (s.school as string) ?? "",
      grade: (s.grade as string) ?? "",
      appliedAt: (e?.created_at as string) ?? (s.created_at as string),
      applicationId: (e?.application_id as string | null) ?? null,
      rawType,
      channel: (e?.channel as string) ?? "",
      eventName: e?.event_id ? eventBy.get(e.event_id as string) ?? null : null,
      primaryStaffId: (s.primary_staff_id as string | null) ?? null,
      enrolled: enrolledIds.has(sid),
      lastContact,
      test: upcoming("test"),
      interview: upcoming("interview"),
      openTasks: open,
      status,
    };
  });
  return { rows: all };
}
