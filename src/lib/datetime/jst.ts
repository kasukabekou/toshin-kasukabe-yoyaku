// サーバー（Vercel）はUTCで動くため、getHours() などのローカル時刻APIを使うと日本時間から9時間ずれる。
// 通知・スタッフ画面の日時表示は必ずここを通して日本時間（Asia/Tokyo）で整形する。

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // 日本は夏時間がないため固定オフセットでよい

interface JstParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

export function jstParts(iso: string): JstParts {
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

// 例: "8/3（月）14:00"
export function formatJstDateTime(iso: string): string {
  const p = jstParts(iso);
  return `${p.month}/${p.day}（${WEEKDAY_LABELS[p.weekday]}）${formatJstTime(iso)}`;
}

// 例: "14:00"
export function formatJstTime(iso: string): string {
  const p = jstParts(iso);
  return `${p.hour}:${String(p.minute).padStart(2, "0")}`;
}

// 例: "2026-08-03"
export function jstDateKey(iso: string): string {
  const p = jstParts(iso);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
