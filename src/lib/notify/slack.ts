import "server-only";

// Slack Incoming Webhook への通知。URL は環境変数 SLACK_WEBHOOK_URL（秘密。コード・ログに出さない）。
// 通知の失敗で本処理を止めない。常に例外を投げず、成功したかだけを返す。
export async function sendSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("slack notification rejected", res.status);
    return res.ok;
  } catch {
    console.error("slack notification failed"); // 詳細（URLを含み得る）は出さない
    return false;
  }
}
