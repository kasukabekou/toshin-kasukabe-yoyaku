import { NextResponse } from "next/server";
import { mailSecretOk } from "@/lib/mail/auth";
import { ingestMail } from "@/lib/mail/ingest";
import { isApplicationMail, parseRaw } from "@/lib/mail/poll";
import { parseApplicationMail } from "@/lib/mail/parseApplicationMail";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Outlook から書き出した .eml 1通を、申込通知として登録する（サーバーに残っていない古いメールの取込用）。管理用（MAIL_INGEST_SECRET のみ）。
//   POST /api/mail/import          … 本文に .eml をそのまま送る。同じ申込は重複しない。Slack通知はしない。
//   POST /api/mail/import?dryRun=1 … DBに書かず、扱われ方だけ返す。
// 件名・氏名・本文は返さない。
export async function POST(request: Request) {
  if (!mailSecretOk(request, "admin")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length === 0) return NextResponse.json({ ok: false, result: "empty" }, { status: 400 });
    const mail = await parseRaw(raw);
    if (!isApplicationMail(mail.subject, mail.from)) return NextResponse.json({ ok: true, result: "skip" });
    if (dry) {
      const r = parseApplicationMail({ subject: mail.subject, body: mail.body });
      return NextResponse.json(
        r.ok ? { ok: true, dryRun: true, result: "register", rawType: r.data.rawType, missing: r.data.missing } : { ok: true, dryRun: true, result: "needs_review", reason: r.reason }
      );
    }
    const r = await ingestMail(mail);
    if (r.status === "error") return NextResponse.json({ ok: false, result: "error" }, { status: 500 });
    return NextResponse.json({ ok: true, result: r.status, ...(r.status === "needs_review" ? { reason: r.reason } : { missing: r.missing }) });
  } catch {
    console.error("mail import failed");
    return NextResponse.json({ ok: false, result: "unreadable" }, { status: 400 });
  }
}
