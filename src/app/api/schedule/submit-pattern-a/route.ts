import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { resolveScheduleToken } from "@/lib/schedule/resolveToken";
import { sendApplicationConfirmationEmail, sendStaffNotificationEmail } from "@/lib/email/sendConfirmation";
import { RAW_TYPE_LABELS } from "@/lib/booking/logic";

const submitSchema = z.object({
  token: z.string().min(1),
  patternA: z.object({
    currentPathHope: z.string().max(200),
    desiredUniversity: z.string().max(200),
    desiredFaculty: z.string().max(200),
    referrerStudentName: z.string().max(200),
    bringFriend: z.boolean(),
  }),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { token, patternA } = parsed.data;

  const resolved = await resolveScheduleToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }
  if (resolved.usedAt) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }
  const applicationId = resolved.applicationId;

  const { error } = await supabaseAdmin.from("schedule_pattern_a_answers").upsert(
    {
      id: `hearA_${applicationId}`,
      application_id: applicationId,
      current_path_hope: patternA.currentPathHope,
      desired_university: patternA.desiredUniversity,
      desired_faculty: patternA.desiredFaculty,
      referrer_student_name: patternA.referrerStudentName,
      bring_friend: patternA.bringFriend,
    },
    { onConflict: "application_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("schedule_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  await sendApplicationConfirmationEmail({
    to: resolved.application.email,
    applicantName: resolved.application.name,
    testSegments: [],
    interviewSlot: null,
  });
  await sendStaffNotificationEmail({
    applicantName: resolved.application.name,
    rawTypeLabel: RAW_TYPE_LABELS[resolved.application.rawType] ?? resolved.application.rawType,
    school: resolved.application.school,
    grade: resolved.application.grade,
    phone: resolved.application.phone,
    testSegments: [],
    interviewSlot: null,
  });

  return NextResponse.json({ ok: true });
}
