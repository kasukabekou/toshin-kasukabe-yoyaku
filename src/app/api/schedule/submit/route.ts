import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { resolveScheduleToken } from "@/lib/schedule/resolveToken";
import { isGoogleCalendarConfigured } from "@/lib/google/calendarClient";
import { isSlotStillFree, insertInterviewEvent } from "@/lib/google/calendarEvents";
import { sendApplicationConfirmationEmail } from "@/lib/email/sendConfirmation";

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
    .array(z.object({ startAt: z.string(), endAt: z.string(), dayIndex: z.number().int().min(0) }))
    .max(30)
    .default([]),
  interviewSlot: z.object({ startAt: z.string(), endAt: z.string() }).nullable(),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { token, hearing, selectedSubjects, testSegments, interviewSlot } = parsed.data;

  const resolved = await resolveScheduleToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }
  if (resolved.usedAt) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }
  const applicationId = resolved.applicationId;

  // 面談枠は「ページ表示時から送信までの間」に他の申込者が同じ枠を確定させている可能性があるため、
  // DB書き込みの前に、その時点のカレンダーで枠がまだ空いているかを確認する。
  let googleEventId: string | null = null;
  if (interviewSlot && isGoogleCalendarConfigured()) {
    const stillFree = await isSlotStillFree(interviewSlot.startAt, interviewSlot.endAt);
    if (!stillFree) {
      return NextResponse.json({ error: "interview_slot_taken" }, { status: 409 });
    }
    googleEventId = await insertInterviewEvent({
      startISO: interviewSlot.startAt,
      endISO: interviewSlot.endAt,
      applicantName: resolved.application.name,
      applicantPhone: resolved.application.phone,
      pattern: resolved.application.pattern,
    });
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
  if (hearingError) {
    return NextResponse.json({ error: hearingError.message }, { status: 500 });
  }

  if (selectedSubjects.length > 0) {
    await supabaseAdmin.from("schedule_test_subject_selections").delete().eq("application_id", applicationId);
    const { error: subjectsError } = await supabaseAdmin.from("schedule_test_subject_selections").insert(
      selectedSubjects.map((subjectKey, order) => ({
        id: `subj_${applicationId}_${order}`,
        application_id: applicationId,
        subject_key: subjectKey,
        subject_order: order,
      }))
    );
    if (subjectsError) {
      return NextResponse.json({ error: subjectsError.message }, { status: 500 });
    }
  }

  const kindsToReplace = [
    ...(testSegments.length > 0 ? ["test"] : []),
    ...(interviewSlot ? ["interview"] : []),
  ];
  if (kindsToReplace.length > 0) {
    await supabaseAdmin
      .from("schedule_appointments")
      .delete()
      .eq("application_id", applicationId)
      .in("kind", kindsToReplace);

    const rows = [
      ...testSegments.map((seg, i) => ({
        id: `appt_${applicationId}_test_${i}`,
        application_id: applicationId,
        kind: "test",
        start_at: seg.startAt,
        end_at: seg.endAt,
        day_index: seg.dayIndex,
      })),
      ...(interviewSlot
        ? [
            {
              id: `appt_${applicationId}_interview`,
              application_id: applicationId,
              kind: "interview",
              start_at: interviewSlot.startAt,
              end_at: interviewSlot.endAt,
              day_index: 0,
              google_event_id: googleEventId,
            },
          ]
        : []),
    ];
    if (rows.length > 0) {
      const { error: apptError } = await supabaseAdmin.from("schedule_appointments").insert(rows);
      if (apptError) {
        return NextResponse.json({ error: apptError.message }, { status: 500 });
      }
    }
  }

  await supabaseAdmin
    .from("schedule_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  // メール送信は失敗しても予約自体の成立に影響させない（awaitはするがエラーは無視）。
  await sendApplicationConfirmationEmail({
    to: resolved.application.email,
    applicantName: resolved.application.name,
    testSegments,
    interviewSlot,
  });

  return NextResponse.json({ ok: true });
}
