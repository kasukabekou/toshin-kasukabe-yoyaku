import { NextResponse } from "next/server";
import { mailSecretOk } from "@/lib/mail/auth";
import { pollMailbox, type PollSummary } from "@/lib/mail/poll";
import { classifyFailure, recordPollFailure, recordPollSuccess } from "@/lib/mail/pollState";
import { sendSlack } from "@/lib/notify/slack";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 通常の取込（パラメータなし）: 外部の定期実行サービス（1分おき）から呼ぶ。MAIL_CRON_SECRET または MAIL_INGEST_SECRET。
//   成功・失敗を記録し、失敗が続いたときと、読み取れない申込通知が出たときに Slack へ通知する。
//
// 以下は管理用（MAIL_INGEST_SECRET のみ。定期実行用のシークレットでは実行できない）:
//   ?backfill=1&offset=0 … メールボックスに既にある申込通知を登録する（offset 通をとばして新しい方から80通を対象。同じ申込は重複しない）。
//        時間の予算を使い切ると途中で止まり、incomplete と nextOffset を返す。nextOffset で続きを実行する。
//   ?backfill=1&dryRun=1&offset=0 … 上の予行演習。DBに書かず、扱われ方だけ返す。
//   ?dryRun=1&census=1 … ヘッダーだけで、申込通知の条件に合うメールの件数を数える（個人情報は返さない）。
//   ?dryRun=1&census=1&subjects=1 … 上に加え、条件に合わない本部発メールの件名の傾向（数字を伏せて種類ごとの件数）を返す。
//   ?dryRun=1&last=5 … 予行演習。DBに書かず、新しい方から数通の「扱われ方」だけを返す（件名・氏名などは返さない）。
async function handle(request: Request) {
  const url = new URL(request.url);
  const q = (k: string) => url.searchParams.get(k) === "1";
  const adminAction = q("dryRun") || q("backfill") || q("census");
  if (!mailSecretOk(request, adminAction ? "admin" : "cron")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (adminAction) {
    try {
      const result = await pollMailbox({
        dryRun: q("dryRun"),
        backfill: q("backfill"),
        offset: Number(url.searchParams.get("offset") ?? 0),
        census: q("census"),
        subjects: q("subjects"),
        last: url.searchParams.get("last") ? Number(url.searchParams.get("last")) : q("census") ? undefined : 5,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch {
      // 内部の詳細（パスワード・ホスト名など）は返さず、ログにも詳細を出さない
      console.error("mail poll failed");
      return NextResponse.json({ ok: false, message: "取得に失敗しました" }, { status: 502 });
    }
  }

  try {
    const result = (await pollMailbox()) as PollSummary;
    await recordPollSuccess(sendSlack);
    const review = result.ingested.find((i) => i.status === "needs_review")?.count ?? 0;
    if (review > 0) {
      await sendSlack(`⚠️ 読み取れない申込通知が${review}件ありました（登録されていません）。内容を確認してください。\n（Supabase の schedule_mail_ingests で status が needs_review の行）`);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("mail poll failed");
    // 失敗したメールは「確認済み」にしていないので、次回の実行が自動でやり直す（再試行）
    await recordPollFailure(classifyFailure(e), sendSlack);
    return NextResponse.json({ ok: false, message: "取得に失敗しました" }, { status: 502 });
  }
}
export const GET = handle;
export const POST = handle;
