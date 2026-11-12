import { NextResponse } from "next/server";
import { and, eq, gt, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBusiness } from "@/lib/booking";
import { notifyCustomer } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Sends reminders for bookings starting in the next 24 hours.
 * Call it every hour, e.g. with Vercel Cron (see vercel.json):
 *   GET /api/cron/reminders   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const due = await db.query.bookings.findMany({
    where: and(
      eq(schema.bookings.status, "CONFIRMED"),
      eq(schema.bookings.reminderSent, false),
      gt(schema.bookings.startsAt, now),
      lte(schema.bookings.startsAt, in24h)
    ),
    with: { service: true, staff: true, customer: true },
  });

  const biz = await getBusiness();
  for (const b of due) {
    await notifyCustomer("reminder", b, biz);
    await db.update(schema.bookings).set({ reminderSent: true }).where(eq(schema.bookings.id, b.id));
  }
  return NextResponse.json({ sent: due.length });
}
