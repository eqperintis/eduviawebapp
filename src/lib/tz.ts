/**
 * Kuala Lumpur time (UTC+8, no daylight saving), so date/time conditions and
 * timestamps read the way the owner sees them. Ported from SEKOOL.
 */
const KL_OFFSET_MINUTES = 8 * 60;

export function utcToKLWallClock(date: Date): { date: string; time: string } {
  const kl = new Date(date.getTime() + KL_OFFSET_MINUTES * 60_000);
  const yyyy = kl.getUTCFullYear();
  const mm = String(kl.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kl.getUTCDate()).padStart(2, "0");
  const hh = String(kl.getUTCHours()).padStart(2, "0");
  const min = String(kl.getUTCMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

const klDateTimeFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "6 Oct 2026, 3:45 pm" in Kuala Lumpur time. */
export function formatKL(date: Date): string {
  return klDateTimeFormatter.format(date);
}
