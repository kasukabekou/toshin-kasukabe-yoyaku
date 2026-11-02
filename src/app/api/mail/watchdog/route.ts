import { NextResponse } from "next/server";
import { mailSecretOk } from "@/lib/mail/auth";
import { checkStale } from "@/lib/mail/pollState";
import { sendSlack } from "@/lib/notify/slack";

export const dynamic = "force-dynamic";

// 見張り: 定期実行そのものが止まっていないか（最後の成功が20分より古くないか）を確認し、止まっていれば Slack へ通知する。
// 取込を実行する外部サービスとは別の仕組み（GitHub Actions）から呼ぶ。メールは取得しない。
async function handle(request: Request) {
  if (!mailSecretOk(request, "cron")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await checkStale(sendSlack)) });
}
export const GET = handle;
export const POST = handle;
