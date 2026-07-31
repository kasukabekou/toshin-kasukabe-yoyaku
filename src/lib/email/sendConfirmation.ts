import "server-only";
import { Resend } from "resend";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

interface ConfirmationInput {
  to: string;
  applicantName: string;
  testSegments: { startAt: string; endAt: string; dayIndex: number }[];
  interviewSlot: { startAt: string; endAt: string } | null;
}

// 送信失敗はアプリ全体の処理を止めない（メールが届かなくても予約自体は成立させる）。
// 呼び出し側は結果を待たずログだけ見ればよい設計にしている。
function staffNotificationRecipients(): string[] {
  const candidates = [
    process.env.STAFF_NOTIFICATION_EMAIL,
    process.env.STAFF_NOTIFICATION_EMAIL1,
    process.env.STAFF_NOTIFICATION_EMAIL2,
  ];
  return candidates.filter((v): v is string => !!v);
}

export function isStaffNotificationConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) && staffNotificationRecipients().length > 0;
}

interface StaffNotificationInput {
  applicantName: string;
  rawTypeLabel: string;
  school: string;
  grade: string;
  phone: string;
  testSegments: { startAt: string; endAt: string; dayIndex: number }[];
  interviewSlot: { startAt: string; endAt: string } | null;
}

// 送信失敗は予約自体の成立に影響させない（確認メールと同じ方針）。
export async function sendStaffNotificationEmail(input: StaffNotificationInput): Promise<void> {
  if (!isStaffNotificationConfigured()) return;

  const lines: string[] = [
    "新しい予約が確定しました。",
    "",
    `氏名：${input.applicantName}`,
    `種別：${input.rawTypeLabel}`,
    `学校/学年：${input.school} / ${input.grade}`,
    `電話：${input.phone}`,
    "",
  ];

  const sortedTests = [...input.testSegments].sort((a, b) => a.dayIndex - b.dayIndex);
  for (const t of sortedTests) {
    lines.push(`■学力診断テスト（${t.dayIndex + 1}日目）：${fmt(t.startAt)}〜${fmt(t.endAt).split("）")[1]}`);
  }
  if (input.interviewSlot) {
    lines.push(`■初回三者面談：${fmt(input.interviewSlot.startAt)}〜${fmt(input.interviewSlot.endAt).split("）")[1]}`);
  }
  lines.push("", "詳細はスタッフ画面（/staff）でご確認ください。");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to: staffNotificationRecipients(),
      subject: `【予約通知】${input.applicantName}様（${input.rawTypeLabel}）`,
      text: lines.join("\n"),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("staff notification email failed", err);
  }
}

export async function sendApplicationConfirmationEmail(input: ConfirmationInput): Promise<void> {
  if (!isEmailConfigured()) return;

  const lines: string[] = [`${input.applicantName}様`, "", "以下の内容でご予約を承りました。"];

  const sortedTests = [...input.testSegments].sort((a, b) => a.dayIndex - b.dayIndex);
  for (const t of sortedTests) {
    lines.push(`■学力診断テスト（${t.dayIndex + 1}日目）：${fmt(t.startAt)}〜${fmt(t.endAt).split("）")[1]}`);
  }
  if (input.interviewSlot) {
    lines.push(`■初回三者面談：${fmt(input.interviewSlot.startAt)}〜${fmt(input.interviewSlot.endAt).split("）")[1]}`);
  }
  lines.push("", "ご不明点がございましたら校舎までお問い合わせください。", "", "東進ハイスクール春日部校");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to: input.to,
      subject: "【東進ハイスクール春日部校】ご予約内容の確認",
      text: lines.join("\n"),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("confirmation email failed", err);
  }
}
