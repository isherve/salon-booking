import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import BookingWizard from "@/components/BookingWizard";
import { getActiveServices, getActiveStaff, getBookingByToken, getBusiness } from "@/lib/booking";
import { todayIn } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; reschedule?: string }>;
}) {
  const sp = await searchParams;
  const [biz, services, staff] = await Promise.all([getBusiness(), getActiveServices(), getActiveStaff()]);

  let reschedule;
  if (sp.reschedule) {
    const b = await getBookingByToken(sp.reschedule);
    if (!b || b.status !== "CONFIRMED") notFound();
    reschedule = { token: b.manageToken, bookingId: b.id, serviceId: b.serviceId, staffId: b.staffId };
  }

  const initialServiceId = services.some((s) => s.id === sp.service) ? sp.service : undefined;

  return (
    <>
      <SiteHeader name={biz.name} />
      <main className="container">
        <h1>{reschedule ? "Reschedule your booking" : "Book an appointment"}</h1>
        <BookingWizard
          services={services.map(({ id, name, description, durationMin, priceCents }) => ({ id, name, description, durationMin, priceCents }))}
          staff={staff.map(({ id, name }) => ({ id, name }))}
          timezone={biz.timezone}
          today={todayIn(biz.timezone)}
          maxDaysAhead={biz.maxDaysAhead}
          initialServiceId={initialServiceId}
          reschedule={reschedule}
        />
      </main>
    </>
  );
}
