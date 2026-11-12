import "server-only";
import { and, asc, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db, schema } from "@/db";
import { generateSlots, type Interval } from "./slots";
import { addDaysStr, localToUtc, todayIn } from "./time";

const { bookings, business, customers, services, staff, timeOff, workingHours } = schema;

export class BookingError extends Error {
  constructor(message: string, public code: "SLOT_TAKEN" | "INVALID" | "NOT_FOUND" = "INVALID") {
    super(message);
  }
}

export async function getBusiness() {
  const [b] = await db.select().from(business).limit(1);
  if (!b) throw new Error("No business found. Run: npm run db:seed");
  return b;
}

export async function getActiveServices() {
  return db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.name));
}

export async function getActiveStaff() {
  return db.select().from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name));
}

/** Busy intervals per staff member for one local day (bookings + time off). */
async function getBusyByStaff(staffIds: string[], dayStart: Date, dayEnd: Date, excludeBookingId?: string) {
  const busy = new Map<string, Interval[]>(staffIds.map((id) => [id, []]));
  if (!staffIds.length) return busy;

  const bookingRows = await db
    .select({ staffId: bookings.staffId, start: bookings.startsAt, end: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        inArray(bookings.staffId, staffIds),
        eq(bookings.status, "CONFIRMED"),
        lt(bookings.startsAt, dayEnd),
        gt(bookings.endsAt, dayStart),
        excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined
      )
    );

  const offRows = await db
    .select({ staffId: timeOff.staffId, start: timeOff.startsAt, end: timeOff.endsAt })
    .from(timeOff)
    .where(and(inArray(timeOff.staffId, staffIds), lt(timeOff.startsAt, dayEnd), gt(timeOff.endsAt, dayStart)));

  for (const r of [...bookingRows, ...offRows]) busy.get(r.staffId)?.push({ start: r.start, end: r.end });
  return busy;
}

export interface AvailableSlot {
  start: string; // ISO UTC
  staffIds: string[]; // which staff are free at this time
}

/**
 * All bookable start times for a service on a local date.
 * staffId = "any" merges every active staff member's availability.
 */
export async function getAvailability(opts: {
  serviceId: string;
  date: string;
  staffId: string | "any";
  excludeBookingId?: string; // when rescheduling, ignore the booking being moved
  now?: Date;
}): Promise<AvailableSlot[]> {
  const biz = await getBusiness();
  const now = opts.now ?? new Date();

  // Don't allow dates in the past or too far ahead
  const today = todayIn(biz.timezone, now);
  if (opts.date < today || opts.date > addDaysStr(today, biz.maxDaysAhead)) return [];

  const [service] = await db.select().from(services).where(eq(services.id, opts.serviceId));
  if (!service || !service.active) throw new BookingError("Service not found", "NOT_FOUND");

  const staffList =
    opts.staffId === "any"
      ? await getActiveStaff()
      : await db.select().from(staff).where(and(eq(staff.id, opts.staffId), eq(staff.active, true)));
  const staffIds = staffList.map((s) => s.id);
  if (!staffIds.length) return [];

  const hours = await db.select().from(workingHours).where(inArray(workingHours.staffId, staffIds));
  const dayStart = localToUtc(opts.date, 0, biz.timezone);
  const dayEnd = localToUtc(addDaysStr(opts.date, 1), 0, biz.timezone);
  const busy = await getBusyByStaff(staffIds, dayStart, dayEnd, opts.excludeBookingId);

  const merged = new Map<string, string[]>();
  for (const s of staffList) {
    const slots = generateSlots({
      date: opts.date,
      timezone: biz.timezone,
      workingRanges: hours.filter((h) => h.staffId === s.id),
      busy: busy.get(s.id) ?? [],
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
      stepMin: biz.slotStepMin,
      now,
      minNoticeMin: biz.minNoticeMin,
    });
    for (const slot of slots) {
      const key = slot.toISOString();
      merged.set(key, [...(merged.get(key) ?? []), s.id]);
    }
  }

  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, staffIds]) => ({ start, staffIds }));
}

/** Postgres error 23P01 = exclusion constraint violated (double booking). */
function isOverlapError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === "23P01" || e?.cause?.code === "23P01" || /no_overlapping_bookings/.test(String(e?.message));
}

async function findOrCreateCustomer(c: { name: string; email?: string | null; phone?: string | null }) {
  const email = c.email?.trim().toLowerCase() || null;
  const phone = c.phone?.replace(/\s+/g, "") || null;
  if (email || phone) {
    const conds = [email ? eq(customers.email, email) : undefined, phone ? eq(customers.phone, phone) : undefined].filter(Boolean);
    const [existing] = await db.select().from(customers).where(or(...conds)).limit(1);
    if (existing) {
      // keep details fresh
      await db.update(customers).set({ name: c.name, email: email ?? existing.email, phone: phone ?? existing.phone }).where(eq(customers.id, existing.id));
      return existing.id;
    }
  }
  const [created] = await db.insert(customers).values({ name: c.name, email, phone }).returning({ id: customers.id });
  return created.id;
}

export interface CreateBookingInput {
  serviceId: string;
  staffId: string | "any";
  startsAt: string; // ISO
  customer: { name: string; email?: string | null; phone?: string | null };
  notes?: string | null;
  source?: "online" | "admin";
}

/**
 * Creates a booking.
 * - Online bookings must match a currently available slot (working hours, notice, etc.).
 * - Admin bookings may be outside working hours, but still can't overlap another booking.
 * - The database exclusion constraint is the final guard against race conditions.
 */
export async function createBooking(input: CreateBookingInput) {
  const biz = await getBusiness();
  const start = new Date(input.startsAt);
  if (isNaN(start.getTime())) throw new BookingError("Invalid start time");

  const [service] = await db.select().from(services).where(eq(services.id, input.serviceId));
  if (!service) throw new BookingError("Service not found", "NOT_FOUND");

  let candidates: string[];
  if (input.source === "admin") {
    if (input.staffId === "any") throw new BookingError("Choose a staff member");
    candidates = [input.staffId];
  } else {
    const date = formatInTimeZone(start, biz.timezone, "yyyy-MM-dd");
    const slots = await getAvailability({ serviceId: service.id, date, staffId: input.staffId });
    const match = slots.find((s) => s.start === start.toISOString());
    if (!match) throw new BookingError("Sorry, that time is no longer available. Please pick another slot.", "SLOT_TAKEN");
    candidates = match.staffIds;
  }

  const customerId = await findOrCreateCustomer(input.customer);
  const end = new Date(start.getTime() + (service.durationMin + service.bufferMin) * 60_000);

  // Try each free staff member; the DB rejects any overlap atomically.
  for (const staffId of candidates) {
    try {
      const [b] = await db
        .insert(bookings)
        .values({
          serviceId: service.id,
          staffId,
          customerId,
          startsAt: start,
          endsAt: end,
          priceCents: service.priceCents,
          notes: input.notes || null,
          source: input.source ?? "online",
        })
        .returning();
      return b;
    } catch (err) {
      if (isOverlapError(err)) continue;
      throw err;
    }
  }
  throw new BookingError("Sorry, that slot was just taken. Please pick another time.", "SLOT_TAKEN");
}

export async function getBookingByToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.manageToken, token),
    with: { service: true, staff: true, customer: true },
  });
  return row ?? null;
}

export async function getBookingById(id: string) {
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.id, id),
    with: { service: true, staff: true, customer: true },
  });
  return row ?? null;
}

/** Move an existing booking to a new time (and maybe a different staff member). */
export async function rescheduleBooking(token: string, newStart: string, staffId: string | "any") {
  const booking = await getBookingByToken(token);
  if (!booking) throw new BookingError("Booking not found", "NOT_FOUND");
  if (booking.status !== "CONFIRMED") throw new BookingError("Only confirmed bookings can be rescheduled");

  const biz = await getBusiness();
  const start = new Date(newStart);
  const date = formatInTimeZone(start, biz.timezone, "yyyy-MM-dd");
  const slots = await getAvailability({
    serviceId: booking.serviceId,
    date,
    staffId,
    excludeBookingId: booking.id,
  });
  const match = slots.find((s) => s.start === start.toISOString());
  if (!match) throw new BookingError("That time is no longer available.", "SLOT_TAKEN");

  const end = new Date(start.getTime() + (booking.service.durationMin + booking.service.bufferMin) * 60_000);
  // Prefer keeping the same staff member if they're free
  const ordered = match.staffIds.includes(booking.staffId)
    ? [booking.staffId, ...match.staffIds.filter((id) => id !== booking.staffId)]
    : match.staffIds;

  for (const sid of ordered) {
    try {
      await db
        .update(bookings)
        .set({ startsAt: start, endsAt: end, staffId: sid, reminderSent: false })
        .where(eq(bookings.id, booking.id));
      return getBookingById(booking.id);
    } catch (err) {
      if (isOverlapError(err)) continue;
      throw err;
    }
  }
  throw new BookingError("That slot was just taken.", "SLOT_TAKEN");
}

export async function cancelBookingByToken(token: string) {
  const booking = await getBookingByToken(token);
  if (!booking) throw new BookingError("Booking not found", "NOT_FOUND");
  if (booking.status !== "CONFIRMED") throw new BookingError("This booking is already " + booking.status.toLowerCase());
  if (booking.startsAt < new Date()) throw new BookingError("Past bookings can't be cancelled online");
  await db.update(bookings).set({ status: "CANCELLED" }).where(eq(bookings.id, booking.id));
  return { ...booking, status: "CANCELLED" as const };
}
