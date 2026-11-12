import { describe, expect, it } from "vitest";
import { generateSlots, type SlotInput } from "./slots";
import { fmtTime } from "./time";

const TZ = "Africa/Johannesburg"; // UTC+2, no daylight saving
// Thursday 2026-11-12
const base: SlotInput = {
  date: "2026-11-12",
  timezone: TZ,
  workingRanges: [{ weekday: 4, startMin: 9 * 60, endMin: 12 * 60 }],
  busy: [],
  durationMin: 60,
  bufferMin: 0,
  stepMin: 60,
  now: new Date("2026-11-01T00:00:00Z"),
  minNoticeMin: 0,
};
const times = (s: Date[]) => s.map((d) => fmtTime(d, TZ));

describe("generateSlots", () => {
  it("creates slots inside working hours", () => {
    expect(times(generateSlots(base))).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("converts local time to the right UTC instant", () => {
    expect(generateSlots(base)[0].toISOString()).toBe("2026-11-12T07:00:00.000Z");
  });

  it("returns nothing on a day off", () => {
    expect(generateSlots({ ...base, date: "2026-11-15" })).toEqual([]); // Sunday
  });

  it("doesn't let a service run past closing time", () => {
    expect(times(generateSlots({ ...base, durationMin: 90, stepMin: 30 }))).toEqual([
      "09:00", "09:30", "10:00", "10:30",
    ]);
  });

  it("removes slots that overlap an existing booking", () => {
    const busy = [{ start: new Date("2026-11-12T08:00:00Z"), end: new Date("2026-11-12T09:00:00Z") }]; // 10:00-11:00 local
    expect(times(generateSlots({ ...base, busy }))).toEqual(["09:00", "11:00"]);
  });

  it("treats back-to-back bookings as NOT overlapping", () => {
    const busy = [{ start: new Date("2026-11-12T08:00:00Z"), end: new Date("2026-11-12T09:00:00Z") }];
    const s = times(generateSlots({ ...base, busy, stepMin: 30 }));
    expect(s).toContain("09:00"); // 09:00-10:00 ends exactly when the booking starts
    expect(s).toContain("11:00"); // starts exactly when the booking ends
    expect(s).not.toContain("09:30");
  });

  it("protects the buffer (cleanup) time", () => {
    const busy = [{ start: new Date("2026-11-12T08:00:00Z"), end: new Date("2026-11-12T09:00:00Z") }];
    // 09:00 + 60min + 15min buffer = 10:15, overlaps the 10:00 booking
    const s = times(generateSlots({ ...base, busy, bufferMin: 15 }));
    expect(s).not.toContain("09:00");
  });

  it("respects lunch breaks (split working ranges)", () => {
    const workingRanges = [
      { weekday: 4, startMin: 9 * 60, endMin: 11 * 60 },
      { weekday: 4, startMin: 12 * 60, endMin: 14 * 60 },
    ];
    expect(times(generateSlots({ ...base, workingRanges }))).toEqual(["09:00", "10:00", "12:00", "13:00"]);
  });

  it("hides slots in the past and inside the minimum notice period", () => {
    const now = new Date("2026-11-12T07:30:00Z"); // 09:30 local
    expect(times(generateSlots({ ...base, now, minNoticeMin: 60 }))).toEqual(["11:00"]);
  });
});
