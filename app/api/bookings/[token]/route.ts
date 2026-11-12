import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingError, cancelBookingByToken, getBusiness, rescheduleBooking } from "@/lib/booking";
import { notifyCustomer } from "@/lib/notify";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("reschedule"),
    startsAt: z.iso.datetime(),
    staffId: z.union([z.literal("any"), z.uuid()]),
  }),
]);

// POST /api/bookings/:token  { action: "cancel" } | { action: "reschedule", startsAt, staffId }
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!rateLimit("manage:" + clientIp(req), 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const biz = await getBusiness();
    if (parsed.data.action === "cancel") {
      const b = await cancelBookingByToken(token);
      notifyCustomer("cancelled", b, biz).catch(console.error);
      return NextResponse.json({ ok: true });
    }
    const b = await rescheduleBooking(token, parsed.data.startsAt, parsed.data.staffId);
    if (b) notifyCustomer("rescheduled", b, biz).catch(console.error);
    return NextResponse.json({ ok: true, token });
  } catch (e) {
    if (e instanceof BookingError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "SLOT_TAKEN" ? 409 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error(e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
