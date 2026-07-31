import "server-only";
import { getGoogleAccessToken } from "./calendarClient";

export interface GoogleBusyBlock {
  startAt: string;
  endAt: string;
}

export async function fetchGoogleBusyBlocks(timeMin: Date, timeMax: Date): Promise<GoogleBusyBlock[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID が未設定です。");
  }
  const accessToken = await getGoogleAccessToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  if (!res.ok) {
    throw new Error(`freeBusy query failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: { start?: string; end?: string }[] }>;
  };
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ startAt: b.start as string, endAt: b.end as string }));
}
