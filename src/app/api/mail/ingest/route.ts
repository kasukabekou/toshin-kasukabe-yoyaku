import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestMail } from "@/lib/mail/ingest";
import { mailSecretOk } from "@/lib/mail/auth";

// 申込通知メールの取込口。受信側（Webhook／ポーリング処理）から呼ぶ。スタッフ認証ではなく共有シークレットで保護する。
// 同じメールを何度送られても、申込は1件だけ登録される（source_key で重複防止）。
const schema = z.object({
  subject: z.string().max(500),
  body: z.string().max(100000),
  from: z.string().max(300).optional(),
  messageId: z.string().max(500).optional(),
  receivedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  if (!mailSecretOk(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const json = await request.json().catch(() => null);
  const parsedBody = schema.safeParse(json);
  if (!parsedBody.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const r = await ingestMail(parsedBody.data);
  if (r.status === "error") return NextResponse.json({ error: r.message }, { status: 500 });
  return NextResponse.json(r);
}
