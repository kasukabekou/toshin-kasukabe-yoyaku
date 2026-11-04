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

const inList = (ids: string[]) => (ids.length ? ids : ["-"]);

export async function loadIntakeRows(): Promise<{ rows: IntakeRow[]; error?: string }> {
  const { data: students, error } = await supabaseAdmin
    .from("schedule_students")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { rows: [], error: error.message };

  const ids = (students ?? []).map((s) => s.id as string);
  const [enr, appts, outs, logs, tasks, settings, events, profiles] = await Promise.all([
    supabaseAdmin.from("schedule_enrollments").select("*").in("student_id", inList(ids)).order("created_at", { ascending: false }),
    supabaseAdmin.from("schedule_appointments").select("*").in("student_id", inList(ids)).order("start_at"),
    supabaseAdmin.from("schedule_outcomes").select("student_id, appointment_id, result").in("student_id", inList(ids)),
    supabaseAdmin.from("schedule_contact_logs").select("*").in("student_id", inList(ids)).order("contacted_at", { ascending: false }),
    supabaseAdmin.from("schedule_tasks").select("*").in("student_id", inList(ids)).in("status", ["todo", "doing"]),
    supabaseAdmin.from("schedule_type_settings").select("*"),
    supabaseAdmin.from("schedule_events").select("id, name"),
    supabaseAdmin.from("schedule_student_profiles").select("student_id").eq("enrollment_status", "enrolled").in("student_id", inList(ids)),
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

  const all: IntakeRow[] = (students ?? []).map((s) => {
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
