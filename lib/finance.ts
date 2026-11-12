import "server-only";
import { and, asc, count, desc, eq, gte, lt, lte, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDaysStr, isDateStr, localToUtc, todayIn } from "./time";

const { bookings, expenses, services, staff } = schema;

export const PRESETS = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-30": "Last 30 days",
  "this-year": "This year",
  custom: "Custom",
} as const;
export type Preset = keyof typeof PRESETS;

/** Turns a preset (or custom from/to) into inclusive local dates + UTC bounds. */
export function resolveRange(tz: string, preset?: string, from?: string, to?: string) {
  const today = todayIn(tz);
  const [y, m] = today.split("-").map(Number);
  const firstOf = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  let p: Preset = preset && preset in PRESETS ? (preset as Preset) : "this-month";
  let start: string, end: string;

  switch (p) {
    case "last-month": {
      const [ly, lm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      start = firstOf(ly, lm);
      end = addDaysStr(firstOf(y, m), -1);
      break;
    }
    case "last-30":
      start = addDaysStr(today, -29);
      end = today;
      break;
    case "this-year":
      start = `${y}-01-01`;
      end = today;
      break;
    case "custom":
      if (isDateStr(from) && isDateStr(to) && from <= to) {
        start = from;
        end = to;
        break;
      }
      p = "this-month";
    // falls through
    default:
      start = firstOf(y, m);
      end = today;
  }
  return {
    preset: p,
    start,
    end,
    fromUtc: localToUtc(start, 0, tz),
    toUtc: localToUtc(addDaysStr(end, 1), 0, tz), // exclusive
  };
}

export type Range = ReturnType<typeof resolveRange>;

export async function financeReport(r: Range, tz: string) {
  const paidInRange = and(gte(bookings.paidAt, r.fromUtc), lt(bookings.paidAt, r.toUtc));
  const startsInRange = and(gte(bookings.startsAt, r.fromUtc), lt(bookings.startsAt, r.toUtc));
  const expInRange = and(gte(expenses.date, r.start), lte(expenses.date, r.end));
  const localDay = sql<string>`to_char(${bookings.paidAt} at time zone ${tz}, 'YYYY-MM-DD')`;

  const [
    [collected],
    [expenseTotal],
    byMethod,
    byService,
    byStaff,
    daily,
    byCategory,
    expenseList,
    [lost],
    outstanding,
    [expected],
  ] = await Promise.all([
    db.select({ total: sum(bookings.paidCents), n: count() }).from(bookings).where(and(paidInRange, sql`${bookings.paidCents} > 0`)),
    db.select({ total: sum(expenses.amountCents) }).from(expenses).where(expInRange),
    db
      .select({ method: bookings.paymentMethod, total: sum(bookings.paidCents), n: count() })
      .from(bookings)
      .where(and(paidInRange, sql`${bookings.paidCents} > 0`))
      .groupBy(bookings.paymentMethod)
      .orderBy(desc(sum(bookings.paidCents))),
    db
      .select({ name: services.name, total: sum(bookings.paidCents), n: count() })
      .from(bookings)
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(and(paidInRange, sql`${bookings.paidCents} > 0`))
      .groupBy(services.name)
      .orderBy(desc(sum(bookings.paidCents))),
    db
      .select({ name: staff.name, total: sum(bookings.paidCents), n: count() })
      .from(bookings)
      .innerJoin(staff, eq(bookings.staffId, staff.id))
      .where(and(paidInRange, sql`${bookings.paidCents} > 0`))
      .groupBy(staff.name)
      .orderBy(desc(sum(bookings.paidCents))),
    db
      .select({ day: localDay, total: sum(bookings.paidCents) })
      .from(bookings)
      .where(and(paidInRange, sql`${bookings.paidCents} > 0`))
      // group/order by column position: the timezone is a query parameter, so
      // repeating the expression would not match the SELECT in Postgres
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ category: expenses.category, total: sum(expenses.amountCents) })
      .from(expenses)
      .where(expInRange)
      .groupBy(expenses.category)
      .orderBy(desc(sum(expenses.amountCents))),
    db.select().from(expenses).where(expInRange).orderBy(desc(expenses.date), desc(expenses.createdAt)).limit(200),
    db
      .select({
        noShowCents: sql<number>`coalesce(sum(${bookings.priceCents}) filter (where ${bookings.status} = 'NO_SHOW'), 0)`.mapWith(Number),
        noShows: sql<number>`count(*) filter (where ${bookings.status} = 'NO_SHOW')`.mapWith(Number),
        cancelled: sql<number>`count(*) filter (where ${bookings.status} = 'CANCELLED')`.mapWith(Number),
        cancelledCents: sql<number>`coalesce(sum(${bookings.priceCents}) filter (where ${bookings.status} = 'CANCELLED'), 0)`.mapWith(Number),
      })
      .from(bookings)
      .where(startsInRange),
    // Completed but not fully paid (any date)
    db.query.bookings.findMany({
      where: and(eq(bookings.status, "COMPLETED"), sql`${bookings.paidCents} < ${bookings.priceCents}`),
      with: { service: true, staff: true, customer: true },
      orderBy: desc(bookings.startsAt),
      limit: 50,
    }),
    // Upcoming confirmed bookings in the next 30 days
    db
      .select({ total: sum(bookings.priceCents), n: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "CONFIRMED"),
          gte(bookings.startsAt, new Date()),
          lt(bookings.startsAt, new Date(Date.now() + 30 * 864e5))
        )
      ),
  ]);

  const collectedCents = Number(collected.total ?? 0);
  const expenseCents = Number(expenseTotal.total ?? 0);
  const outstandingCents = outstanding.reduce((a, b) => a + (b.priceCents - b.paidCents), 0);
  const num = <T extends { total: string | null }>(rows: T[]) => rows.map((r) => ({ ...r, total: Number(r.total ?? 0) }));

  return {
    collectedCents,
    payments: collected.n,
    avgTicketCents: collected.n ? Math.round(collectedCents / collected.n) : 0,
    expenseCents,
    profitCents: collectedCents - expenseCents,
    outstandingCents,
    outstanding,
    expectedCents: Number(expected.total ?? 0),
    expectedCount: expected.n,
    lost,
    byMethod: num(byMethod),
    byService: num(byService),
    byStaff: num(byStaff),
    byCategory: num(byCategory),
    daily: num(daily),
    expenseList,
  };
}

/** Rows for the CSV export: every payment and every expense in the range. */
export async function exportRows(r: Range) {
  const paid = await db.query.bookings.findMany({
    where: and(gte(bookings.paidAt, r.fromUtc), lt(bookings.paidAt, r.toUtc), sql`${bookings.paidCents} > 0`),
    with: { service: true, staff: true, customer: true },
    orderBy: asc(bookings.paidAt),
  });
  const exp = await db
    .select()
    .from(expenses)
    .where(and(gte(expenses.date, r.start), lte(expenses.date, r.end)))
    .orderBy(asc(expenses.date));
  return { paid, exp };
}

