import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CancelButton from "@/components/CancelButton";
import { getBookingByToken, getBusiness } from "@/lib/booking";
import { fmtDate, fmtTime, money } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string; moved?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const [biz, b] = await Promise.all([getBusiness(), getBookingByToken(token)]);
  if (!b) notFound();

  const tz = biz.timezone;
  const upcoming = b.status === "CONFIRMED" && b.startsAt > new Date();

  return (
    <>
      <SiteHeader name={biz.name} />
      <main className="container">
        {sp.new && b.status === "CONFIRMED" && (
          <div className="alert success">🎉 You're booked! A confirmation has been sent to you.</div>
        )}
        {sp.moved && b.status === "CONFIRMED" && <div className="alert success">✅ Your booking has been moved.</div>}

        <div className="card">
          <div className="row between">
            <h1 style={{ margin: 0 }}>Your booking</h1>
            <span className={`badge ${b.status}`}>{b.status.replace("_", " ")}</span>
          </div>

          <dl className="summary" style={{ marginTop: 16 }}>
            <dt>Service</dt><dd>{b.service.name} · {money(b.priceCents)}</dd>
            <dt>Date</dt><dd>{fmtDate(b.startsAt, tz)}</dd>
            <dt>Time</dt><dd>{fmtTime(b.startsAt, tz)} ({b.service.durationMin} min)</dd>
            <dt>With</dt><dd>{b.staff.name}</dd>
            <dt>Name</dt><dd>{b.customer.name}</dd>
            {biz.address && (<><dt>Where</dt><dd>{biz.address}</dd></>)}
          </dl>

          {upcoming ? (
            <>
              <p className="muted small">Save this page. You can use it to change or cancel your booking.</p>
              <div className="row">
                <Link className="btn secondary" href={`/book?reschedule=${b.manageToken}`}>Reschedule</Link>
                <CancelButton token={b.manageToken} />
              </div>
            </>
          ) : (
            <Link className="btn" href="/book">Book another appointment</Link>
          )}
        </div>
      </main>
    </>
  );
}
