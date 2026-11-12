import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** "2026-11-12" + 540 minutes in a timezone -> exact UTC Date */
export function localToUtc(dateStr: string, minutesFromMidnight: number, tz: string): Date {
  const h = String(Math.floor(minutesFromMidnight / 60)).padStart(2, "0");
  const m = String(minutesFromMidnight % 60).padStart(2, "0");
  return fromZonedTime(`${dateStr}T${h}:${m}:00`, tz);
}

/** Weekday (0=Sun..6=Sat) of a "YYYY-MM-DD" calendar date. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Today's date "YYYY-MM-DD" in the business timezone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

/** Add days to a "YYYY-MM-DD" string. */
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export function fmtTime(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "HH:mm");
}
export function fmtDate(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "EEE d MMM yyyy");
}
export function fmtDateTime(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "EEE d MMM yyyy, HH:mm");
}

export function minToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function hhmmToMin(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function money(cents: number) {
  return `R${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
