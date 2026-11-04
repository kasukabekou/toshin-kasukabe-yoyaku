import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { gradeGroupForGrade, patternForRawType } from "@/lib/booking/logic";
import { clientIp } from "@/lib/http/clientIp";
import { generateApplicationToken, generateId } from "@/lib/schedule/token";

const RAW_TYPES = [
  "special_invite", "document_request", "briefing", "school_course_briefing", "open_class", "trial_day",
  "week_intensive_trial",
] as const;
const GRADES = ["高1", "高2", "高3"] as const;
const RELATIONS = ["self", "parent", "other"] as const;

const createSchema = z.object({
  rawType: z.enum(RAW_TYPES),
  name: z.string().min(1).max(100),
  nameKana: z.string().min(1).max(100),
  school: z.string().min(1).max(100),
  grade: z.enum(GRADES),
  email: z.string().email().max(200),
  phone: z.string().min(1).max(50),
  relation: z.enum(RELATIONS),
  // ハニーポット：人間には見えない入力欄。Botは機械的に全欄を埋めるため、値が入っていたら弾く。
  website: z.string().max(200).optional().default(""),
});

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30日
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10; // 10分
const RATE_LIMIT_MAX = 5; // 同一IPから10分間に5件まで

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.website) {
    // ハニーポットに入力があった＝Bot。人間には気づかれないよう、通常のバリデーションエラーと同じ形で返す。
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { rawType, name, nameKana, school, grade, email, phone, relation } = parsed.data;

  const ip = clientIp(request.headers);
  if (ip !== "unknown") {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await supabaseAdmin
      .from("schedule_applications")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  const pattern = patternForRawType(rawType);
  const gradeGroup = pattern === "A" ? null : gradeGroupForGrade(grade);

  const applicationId = generateId("app");
  // 生徒は申込と1対1で作成（007の移行と同じ命名）。名寄せは自動で行わずスタッフ確認に回す。
  const studentId = `stu_${applicationId}`;
  const { error: studentError } = await supabaseAdmin.from("schedule_students").insert({
    id: studentId,
    name,
    name_kana: nameKana,
    school,
    grade,
    email,
    phone,
  });
  if (studentError) {
    // eslint-disable-next-line no-console
    console.error("student insert failed", studentError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  const { error: appError } = await supabaseAdmin.from("schedule_applications").insert({
    id: applicationId,
    pattern,
    raw_type: rawType,
    name,
    name_kana: nameKana,
    school,
    grade,
    email,
    phone,
    relation,
    grade_group: gradeGroup,
    arrival_constraint_note: null,
    ip_address: ip === "unknown" ? null : ip,
    student_id: studentId,
  });
  if (appError) {
    // eslint-disable-next-line no-console
    console.error("application insert failed", appError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { error: enrollError } = await supabaseAdmin.from("schedule_enrollments").insert({
    id: `enr_${applicationId}`,
    student_id: studentId,
    application_id: applicationId,
    raw_type: rawType,
    channel: "form",
  });
  if (enrollError) {
    // eslint-disable-next-line no-console
    console.error("enrollment insert failed", enrollError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const token = generateApplicationToken();
  const { error: tokenError } = await supabaseAdmin.from("schedule_tokens").insert({
    id: generateId("tok"),
    application_id: applicationId,
    token,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    used_at: null,
  });
  if (tokenError) {
    // eslint-disable-next-line no-console
    console.error("token insert failed", tokenError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ token });
}
