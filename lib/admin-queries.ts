import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";

const { bookings, customers } = schema;

export type BookingRow = Awaited<ReturnType<typeof listBookings>>[number];

/** Bookings between two instants, with service/staff/customer joined. */
export async function listBookings(opts: {
  from?: Date;
  to?: Date;
  statuses?: ("CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW")[];
  order?: "asc" | "desc";
  limit?: number;
  customerId?: string;
  staffId?: string; // limit to one staff member's calendar
}) {
  return db.query.bookings.findMany({
    where: and(
      opts.from ? gte(bookings.startsAt, opts.from) : undefined,
      opts.to ? lt(bookings.startsAt, opts.to) : undefined,
      opts.statuses ? inArray(bookings.status, opts.statuses) : undefined,
      opts.customerId ? eq(bookings.customerId, opts.customerId) : undefined,
      opts.staffId ? eq(bookings.staffId, opts.staffId) : undefined
    ),
    with: { service: true, staff: true, customer: true },
    orderBy: opts.order === "desc" ? desc(bookings.startsAt) : asc(bookings.startsAt),
    limit: opts.limit ?? 200,
  });
}

export async function dashboardStats(now: Date, todayStart: Date, todayEnd: Date, monthStart: Date, monthEnd: Date, staffId?: string) {
  const mine = staffId ? eq(bookings.staffId, staffId) : undefined;
  const active = and(inArray(bookings.status, ["CONFIRMED", "COMPLETED"]), mine);

  const [[today], [week], [revenue], [last30]] = await Promise.all([
    db.select({ n: count() }).from(bookings).where(and(active, gte(bookings.startsAt, todayStart), lt(bookings.startsAt, todayEnd))),
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(mine, eq(bookings.status, "CONFIRMED"), gte(bookings.startsAt, now), lt(bookings.startsAt, new Date(now.getTime() + 7 * 864e5)))),
    db.select({ total: sum(bookings.paidCents) }).from(bookings).where(and(mine, gte(bookings.paidAt, monthStart), lt(bookings.paidAt, monthEnd))),
    db
      .select({
        finished: sql<number>`count(*) filter (where ${bookings.status} in ('COMPLETED','NO_SHOW'))`.mapWith(Number),
        noShows: sql<number>`count(*) filter (where ${bookings.status} = 'NO_SHOW')`.mapWith(Number),
      })
      .from(bookings)
      .where(and(mine, gte(bookings.startsAt, new Date(now.getTime() - 30 * 864e5)), lt(bookings.startsAt, now))),
  ]);

  return {
    today: today.n,
    next7: week.n,
    monthRevenueCents: Number(revenue.total ?? 0),
    noShowRate: last30.finished ? Math.round((last30.noShows / last30.finished) * 100) : 0,
  };
}

export async function listCustomers(q?: string, staffId?: string) {
  const search = q ? `%${q}%` : undefined;
  return db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      visits: sql<number>`count(${bookings.id}) filter (where ${bookings.status} = 'COMPLETED')`.mapWith(Number),
      total: count(bookings.id),
      lastVisit: sql<Date | null>`max(${bookings.startsAt}) filter (where ${bookings.startsAt} < now())`.mapWith((v) => (v ? new Date(v) : null)),
      noShows: sql<number>`count(${bookings.id}) filter (where ${bookings.status} = 'NO_SHOW')`.mapWith(Number),
    })
    .from(customers)
    .leftJoin(bookings, staffId ? and(eq(bookings.customerId, customers.id), eq(bookings.staffId, staffId)) : eq(bookings.customerId, customers.id))
    .where(
      and(
        search ? or(ilike(customers.name, search), ilike(customers.email, search), ilike(customers.phone, search)) : undefined,
        staffId ? sql`exists (select 1 from ${bookings} b2 where b2.customer_id = ${customers.id} and b2.staff_id = ${staffId})` : undefined
      )
    )
    .groupBy(customers.id)
    .orderBy(asc(customers.name))
    .limit(300);
}
