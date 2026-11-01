import { NextResponse } from "next/server";
import { mailSecretOk } from "@/lib/mail/auth";
import { pollMailbox } from "@/lib/mail/poll";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// 外部の定期実行サービス（1分おき）から呼ぶ。ヘッダー x-ingest-secret が必要。
//   ?backfill=1&offset=0 … メールボックスに既にある申込通知を登録する（offset 通をとばして新しい方から80通を対象。同じ申込は重複しない）。
//   ?backfill=1&dryRun=1&offset=0 … 上の予行演習。DBに書かず、扱われ方だけ返す。
//   ?dryRun=1&census=1 … ヘッダーだけで、申込通知の条件に合うメールの件数を数える（個人情報は返さない）。
//   ?dryRun=1&census=1&subjects=1 … 上に加え、条件に合わない本部発メールの件名の傾向（数字を伏せて種類ごとの件数）を返す。
//   ?dryRun=1&last=5 … 予行演習。DBに書かず、新しい方から数通の「扱われ方」だけを返す（件名・氏名などは返さない）。
async function handle(request: Request) {
  if (!mailSecretOk(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const result = await pollMailbox({
      dryRun: url.searchParams.get("dryRun") === "1",
      backfill: url.searchParams.get("backfill") === "1",
      offset: Number(url.searchParams.get("offset") ?? 0),
      census: url.searchParams.get("census") === "1",
      subjects: url.searchParams.get("subjects") === "1",
      last: url.searchParams.get("last") ? Number(url.searchParams.get("last")) : url.searchParams.get("census") === "1" ? undefined : 5,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    // 内部の詳細（パスワード・ホスト名など）は返さず、ログにも詳細を出さない
    console.error("mail poll failed");
    return NextResponse.json({ ok: false, message: "取得に失敗しました" }, { status: 502 });
  }
}
export const GET = handle;
export const POST = handle;
