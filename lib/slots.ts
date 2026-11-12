import { localToUtc, weekdayOf } from "./time";

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotInput {
  date: string; // "YYYY-MM-DD" in the business timezone
  timezone: string; // e.g. "Africa/Johannesburg"
  workingRanges: { weekday: number; startMin: number; endMin: number }[];
  busy: Interval[]; // existing bookings (end incl. buffer) + time off
  durationMin: number; // service length
  bufferMin: number; // cleanup after the service
  stepMin: number; // slot grid, e.g. 15
  now: Date;
  minNoticeMin: number; // can't book closer to "now" than this
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

/**
 * Pure function: returns every start time (UTC) that is bookable.
 *
 * A slot is valid when:
 *  1. the SERVICE (without buffer) fits inside one working range,
 *  2. service + buffer doesn't overlap any busy interval,
 *  3. it starts at least `minNoticeMin` minutes from now.
 */
export function generateSlots(input: SlotInput): Date[] {
  const weekday = weekdayOf(input.date);
  const ranges = input.workingRanges
    .filter((r) => r.weekday === weekday)
    .sort((a, b) => a.startMin - b.startMin);

  const earliest = new Date(input.now.getTime() + input.minNoticeMin * 60_000);
  const slots: Date[] = [];

  for (const r of ranges) {
    for (let t = r.startMin; t + input.durationMin <= r.endMin; t += input.stepMin) {
      const start = localToUtc(input.date, t, input.timezone);
      if (start < earliest) continue;

      const blockEnd = new Date(start.getTime() + (input.durationMin + input.bufferMin) * 60_000);
      const candidate = { start, end: blockEnd };
      if (input.busy.some((b) => overlaps(candidate, b))) continue;

      slots.push(start);
    }
  }
  return slots;
}
