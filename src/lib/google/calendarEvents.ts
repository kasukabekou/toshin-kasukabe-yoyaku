import "server-only";
import { getGoogleAccessToken } from "./calendarClient";

// 面談枠が「今この瞬間も」空いているかを再確認する（ページ表示時から送信までの間に他の人が確定した可能性があるため）。
export async function isSlotStillFree(startISO: string, endISO: string): Promise<boolean> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID が未設定です。");
  const accessToken = await getGoogleAccessToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: startISO, timeMax: endISO, items: [{ id: calendarId }] }),
  });
  if (!res.ok) {
    throw new Error(`freeBusy recheck failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { calendars?: Record<string, { busy?: unknown[] }> };
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.length === 0;
}

export async function insertInterviewEvent(params: {
  startISO: string;
  endISO: string;
  applicantName: string;
  applicantPhone: string;
  pattern: string;
}): Promise<string> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID が未設定です。");
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `初回三者面談：${params.applicantName}様`,
        description: `予約フォームからの自動登録\n電話番号: ${params.applicantPhone}\nパターン: ${params.pattern}`,
        start: { dateTime: params.startISO },
        end: { dateTime: params.endISO },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`calendar event insert failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
