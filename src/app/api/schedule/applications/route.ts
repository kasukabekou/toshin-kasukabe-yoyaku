import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/adminClient";
import { patternForRawType } from "@/lib/booking/logic";
import { generateApplicationToken, generateId } from "@/lib/schedule/token";

const RAW_TYPES = [
  "special_invite", "document_request", "briefing", "school_course_briefing", "open_class", "trial_day",
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

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

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

  const ip = clientIp(request);
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
  const gradeGroup = pattern === "A" ? null : grade === "高3" ? "g3" : "g12";

  const applicationId = generateId("app");
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
  });
  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
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
    return NextResponse.json({ error: tokenError.message }, { status: 500 });
  }

  return NextResponse.json({ token });
}
