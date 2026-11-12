import { NextResponse } from "next/server";
import { BookingError, getAvailability } from "@/lib/booking";
import { isDateStr } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/availability?serviceId=...&date=2026-11-12&staffId=any&exclude=<token-booking-id>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const date = url.searchParams.get("date");
  const staffId = url.searchParams.get("staffId") || "any";
  const excludeBookingId = url.searchParams.get("exclude") || undefined;

  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(serviceId) || !isDateStr(date) || (staffId !== "any" && !uuid.test(staffId))) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }
  if (excludeBookingId && !uuid.test(excludeBookingId)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  try {
    const slots = await getAvailability({ serviceId, date, staffId, excludeBookingId });
    return NextResponse.json({ slots });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
  }
}
