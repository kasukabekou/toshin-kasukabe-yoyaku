import "server-only";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function isLineNotificationConfigured(): boolean {
  return !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_TARGET_ID);
}

interface LineNotificationInput {
  applicantName: string;
  rawTypeLabel: string;
  school: string;
  grade: string;
  phone: string;
  testSegments: { startAt: string; endAt: string; dayIndex: number }[];
  interviewSlot: { startAt: string; endAt: string } | null;
}

// 送信失敗は予約自体の成立に影響させない（メール通知と同じ方針）。
export async function sendLineNotification(input: LineNotificationInput): Promise<void> {
  if (!isLineNotificationConfigured()) return;

  const lines: string[] = [
    "【新しい予約】",
    `氏名：${input.applicantName}`,
    `種別：${input.rawTypeLabel}`,
    `学校/学年：${input.school} / ${input.grade}`,
    `電話：${input.phone}`,
  ];

  const sortedTests = [...input.testSegments].sort((a, b) => a.dayIndex - b.dayIndex);
  for (const t of sortedTests) {
    lines.push(`学力診断テスト（${t.dayIndex + 1}日目）：${fmt(t.startAt)}〜${fmt(t.endAt).split("）")[1]}`);
  }
  if (input.interviewSlot) {
    lines.push(`初回三者面談：${fmt(input.interviewSlot.startAt)}〜${fmt(input.interviewSlot.endAt).split("）")[1]}`);
  }
  lines.push("詳細はこちら：https://toshin-kasukabe-yoyaku.vercel.app/staff");

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: process.env.LINE_TARGET_ID,
        messages: [{ type: "text", text: lines.join("\n") }],
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error("LINE notification rejected", res.status, await res.text());
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("LINE notification failed", err);
  }
}
