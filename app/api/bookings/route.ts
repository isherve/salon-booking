import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingError, createBooking, getBookingById, getBusiness } from "@/lib/booking";
import { notifyCustomer } from "@/lib/notify";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z
  .object({
    serviceId: z.uuid(),
    staffId: z.union([z.literal("any"), z.uuid()]),
    startsAt: z.iso.datetime(),
    name: z.string().trim().min(2, "Please enter your name").max(80),
    email: z.union([z.email("Invalid email"), z.literal("")]).optional(),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[+\d\s()-]*$/, "Invalid phone number")
      .optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.email || d.phone, { message: "Enter an email or phone number so we can confirm" });

// POST /api/bookings  -> creates a booking
export async function POST(req: Request) {
  if (!rateLimit("book:" + clientIp(req), 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const booking = await createBooking({
      serviceId: d.serviceId,
      staffId: d.staffId,
      startsAt: d.startsAt,
      customer: { name: d.name, email: d.email || null, phone: d.phone || null },
      notes: d.notes,
      source: "online",
    });

    const full = await getBookingById(booking.id);
    if (full) notifyCustomer("confirmed", full, await getBusiness()).catch(console.error);

    return NextResponse.json({ token: booking.manageToken }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "SLOT_TAKEN" ? 409 : 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
