import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { resolveScheduleToken } from "@/lib/schedule/resolveToken";
import { isGoogleCalendarConfigured } from "@/lib/google/calendarClient";
import { isSlotStillFree, insertInterviewEvent, isTestCalendarConfigured, insertTestEvent, deleteCalendarEvent } from "@/lib/google/calendarEvents";
import { sendApplicationConfirmationEmail, sendStaffNotificationEmail } from "@/lib/email/sendConfirmation";
import { sendLineNotification } from "@/lib/line/sendLineNotification";
import { claimScheduleToken, releaseScheduleToken } from "@/lib/schedule/claimToken";
import { validateInterviewSlot, validateTestSegments } from "@/lib/booking/validateSlots";
import { RAW_TYPE_LABELS, CALENDAR_SUBJECT_LABELS, testTypeLabelForGradeGroup } from "@/lib/booking/logic";
import type { SubjectKey } from "@/lib/types";

const hearingSchema = z.object({
  item1: z.string().max(2000), item2: z.string().max(2000), item3: z.string().max(2000),
  item4: z.string().max(2000), item5: z.string().max(2000), item6: z.string().max(2000),
  item7: z.string().max(2000), item8: z.string().max(2000), item9: z.string().max(2000),
});

const submitSchema = z.object({
  token: z.string().min(1),
  hearing: hearingSchema,
  selectedSubjects: z.array(z.string().max(64)).max(20).default([]),
  testSegments: z
    .array(z.object({
      startAt: z.string(),
      endAt: z.string(),
      dayIndex: z.number().int().min(0),
      subjects: z.array(z.string().max(64)).max(20).default([]),
    }))
    .max(30)
    .default([]),
  interviewSlot: z.object({ startAt: z.string(), endAt: z.string() }).nullable(),
});

// 排他制約違反（supabase/005 の面談重複防止）
const EXCLUSION_VIOLATION = "23P01";

class SlotTakenError extends Error {}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { token, hearing, selectedSubjects, testSegments, interviewSlot } = parsed.data;

  const slotError = (interviewSlot && validateInterviewSlot(interviewSlot)) || validateTestSegments(testSegments);
  if (slotError) {
    return NextResponse.json({ error: "invalid_slot", detail: slotError }, { status: 400 });
  }

  const resolved = await resolveScheduleToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }
  if (resolved.usedAt) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }
  const applicationId = resolved.applicationId;

  // 以降の処理より先にトークンを確保する。同じトークンの並行送信はここで1件に絞られる。
  if (!(await claimScheduleToken(token))) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  // 途中で失敗したときに取り消すための記録
  const createdEvents: { target: "interview" | "test"; id: string }[] = [];
  let appointmentsInserted = false;

  const rawTypeLabel = RAW_TYPE_LABELS[resolved.application.rawType] ?? resolved.application.rawType;
  try {
    // 面談枠は「ページ表示時から送信までの間」に他の申込者が同じ枠を確定させている可能性があるため、
    // DB書き込みの前に、その時点のカレンダーで枠がまだ空いているかを確認する。
    if (interviewSlot && isGoogleCalendarConfigured()) {
      const stillFree = await isSlotStillFree(interviewSlot.startAt, interviewSlot.endAt);
      if (!stillFree) throw new SlotTakenError();
    }

    const { error: hearingError } = await supabaseAdmin.from("schedule_hearing_answers").upsert(
      {
        id: `hear_${applicationId}`,
        application_id: applicationId,
        item1: hearing.item1, item2: hearing.item2, item3: hearing.item3,
        item4: hearing.item4, item5: hearing.item5, item6: hearing.item6,
        item7: hearing.item7, item8: hearing.item8, item9: hearing.item9,
      },
      { onConflict: "application_id" }
    );
    if (hearingError) throw new Error(`hearing upsert failed: ${hearingError.message}`);

    if (selectedSubjects.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("schedule_test_subject_selections")
        .delete()
        .eq("application_id", applicationId);
      if (deleteError) throw new Error(`subjects delete failed: ${deleteError.message}`);
      const { error: subjectsError } = await supabaseAdmin.from("schedule_test_subject_selections").insert(
        selectedSubjects.map((subjectKey, order) => ({
          id: `subj_${applicationId}_${order}`,
          application_id: applicationId,
          subject_key: subjectKey,
          subject_order: order,
        }))
      );
      if (subjectsError) throw new Error(`subjects insert failed: ${subjectsError.message}`);
    }

    // 予約行はカレンダー登録より先に入れる。面談の重複はDBの排他制約で弾き、
    // 弾かれた場合はカレンダーに何も作らずに済ませる。
    const testRows = testSegments.map((seg, i) => ({
      id: `appt_${applicationId}_test_${i}`,
      application_id: applicationId,
      kind: "test",
      start_at: seg.startAt,
      end_at: seg.endAt,
      day_index: seg.dayIndex,
      google_event_id: null as string | null,
    }));
    const interviewRow = interviewSlot
      ? {
          id: `appt_${applicationId}_interview`,
          application_id: applicationId,
          kind: "interview",
          start_at: interviewSlot.startAt,
          end_at: interviewSlot.endAt,
          day_index: 0,
          google_event_id: null as string | null,
        }
      : null;
    const rows = [...testRows, ...(interviewRow ? [interviewRow] : [])];
    if (rows.length > 0) {
      const { error: apptError } = await supabaseAdmin.from("schedule_appointments").insert(rows);
      if (apptError) {
        if (apptError.code === EXCLUSION_VIOLATION) throw new SlotTakenError();
        throw new Error(`appointments insert failed: ${apptError.message}`);
      }
      appointmentsInserted = true;
    }

    if (interviewRow && isGoogleCalendarConfigured()) {
      const eventId = await insertInterviewEvent({
        startISO: interviewRow.start_at,
        endISO: interviewRow.end_at,
        applicantName: resolved.application.name,
        applicantPhone: resolved.application.phone,
        pattern: resolved.application.pattern,
      });
      createdEvents.push({ target: "interview", id: eventId });
      interviewRow.google_event_id = eventId;
    }

    if (testSegments.length > 0 && isTestCalendarConfigured()) {
      const gradeGroup = resolved.application.gradeGroup ?? "g3";
      const gradeNum = resolved.application.grade.replace("高", "");
      const testTypeLabel = testTypeLabelForGradeGroup(gradeGroup);
      for (const [i, seg] of testSegments.entries()) {
        const subjectNames = seg.subjects.map((k) => CALENDAR_SUBJECT_LABELS[k as SubjectKey] ?? k).join("・");
        const eventId = await insertTestEvent({
          startISO: seg.startAt,
          endISO: seg.endAt,
          summary: `${resolved.application.name}（${resolved.application.school}${gradeNum}年）学診（${testTypeLabel}　${subjectNames}）`,
          applicantPhone: resolved.application.phone,
          rawTypeLabel,
          dayIndex: seg.dayIndex,
        });
        createdEvents.push({ target: "test", id: eventId });
        testRows[i].google_event_id = eventId;
      }
    }

    // イベントIDの保存に失敗しても予約自体は成立しているため、ログだけ残して続行する。
    for (const row of rows) {
      if (!row.google_event_id) continue;
      const { error } = await supabaseAdmin
        .from("schedule_appointments")
        .update({ google_event_id: row.google_event_id })
        .eq("id", row.id);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("google_event_id update failed", row.id, error);
      }
    }
  } catch (err) {
    for (const ev of createdEvents) await deleteCalendarEvent(ev.target, ev.id);
    if (appointmentsInserted) {
      const { error } = await supabaseAdmin.from("schedule_appointments").delete().eq("application_id", applicationId);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("appointments rollback failed", error);
      }
    }
    await releaseScheduleToken(token);
    if (err instanceof SlotTakenError) {
      return NextResponse.json({ error: "interview_slot_taken" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("schedule submit failed", err);
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }

  // メール送信は失敗しても予約自体の成立に影響させない（awaitはするがエラーは無視）。
  await sendApplicationConfirmationEmail({
    to: resolved.application.email,
    applicantName: resolved.application.name,
    testSegments,
    interviewSlot,
  });
  await sendStaffNotificationEmail({
    applicantName: resolved.application.name,
    rawTypeLabel,
    school: resolved.application.school,
    grade: resolved.application.grade,
    phone: resolved.application.phone,
    testSegments,
    interviewSlot,
  });
  await sendLineNotification({
    applicantName: resolved.application.name,
    rawTypeLabel,
    school: resolved.application.school,
    grade: resolved.application.grade,
    phone: resolved.application.phone,
    testSegments,
    interviewSlot,
  });

  return NextResponse.json({ ok: true });
}
