import Link from "next/link";
import { notFound } from "next/navigation";
import BookingActions from "@/components/BookingActions";
import { PaymentBadge } from "@/components/BookingTable";
import { clearPayment, recordPayment } from "../../../actions";
import { PAYMENT_METHODS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canAccessBooking } from "@/lib/permissions";
import { getBookingById, getBusiness } from "@/lib/booking";
import { normalizePhone } from "@/lib/notify";
import { fmtDate, fmtDateTime, fmtTime, money } from "@/lib/time";

export default async function BookingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [biz, b] = await Promise.all([getBusiness(), getBookingById(id)]);
  if (!b) notFound();
  const user = await requireUser();
  if (!canAccessBooking(user, b)) notFound();
  const tz = biz.timezone;
  const waText = encodeURIComponent(
    `Hi ${b.customer.name.split(" ")[0]}, this is ${biz.name} about your ${b.service.name} on ${fmtDateTime(b.startsAt, tz)}.`
  );

  return (
    <>
      <p><Link href="/admin/bookings">← All bookings</Link></p>
      <div className="row between">
        <h1>{b.service.name}</h1>
        <span className={`badge ${b.status}`}>{b.status.replace("_", " ")}</span>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ maxWidth: 640 }}>
        <dl className="summary">
          <dt>When</dt><dd>{fmtDate(b.startsAt, tz)}, {fmtTime(b.startsAt, tz)} ({b.service.durationMin} min + {b.service.bufferMin} min cleanup)</dd>
          <dt>Staff</dt><dd>{b.staff.name}</dd>
          <dt>Price</dt><dd>{money(b.priceCents)} <PaymentBadge paid={b.paidCents} price={b.priceCents} status={b.status} /></dd>
          <dt>Customer</dt>
          <dd>
            <Link href={`/admin/customers/${b.customer.id}`}>{b.customer.name}</Link>
            <div className="small" style={{ fontWeight: 400 }}>
              {b.customer.phone && (
                <>
                  <a href={`tel:${b.customer.phone}`}>{b.customer.phone}</a> ·{" "}
                  <a href={`https://wa.me/${normalizePhone(b.customer.phone).replace("+", "")}?text=${waText}`} target="_blank">WhatsApp</a>
                </>
              )}
              {b.customer.email && <> {b.customer.phone && "·"} <a href={`mailto:${b.customer.email}`}>{b.customer.email}</a></>}
            </div>
          </dd>
          {b.notes && (<><dt>Notes</dt><dd style={{ fontWeight: 400 }}>{b.notes}</dd></>)}
          <dt>Booked</dt><dd style={{ fontWeight: 400 }}>{fmtDateTime(b.createdAt, tz)} · {b.source === "admin" ? "by staff" : "online"}</dd>
        </dl>

        <div className="row" style={{ marginTop: 16 }}>
          <BookingActions id={b.id} status={b.status} isPast={b.startsAt < new Date()} returnTo={`/admin/bookings/${b.id}`} />
          {b.status === "CONFIRMED" && b.startsAt > new Date() && (
            <a className="btn sm secondary" href={`/book?reschedule=${b.manageToken}`} target="_blank">Reschedule</a>
          )}
        </div>
      </div>

      {b.status !== "CANCELLED" && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Payment</h2>
          {b.paidCents > 0 && (
            <p>
              Received <strong>{money(b.paidCents)}</strong> by {b.paymentMethod?.toUpperCase()}
              {b.paidAt && <> on {fmtDateTime(b.paidAt, tz)}</>}
              {b.paidCents < b.priceCents && <> · <span className="bad">{money(b.priceCents - b.paidCents)} still owed</span></>}
            </p>
          )}
          <form action={recordPayment} className="pay-form">
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="returnTo" value={`/admin/bookings/${b.id}`} />
            <div>
              <label>Amount (R)</label>
              <input type="number" name="amount" step="0.01" min="0" required defaultValue={(b.paidCents || b.priceCents) / 100} style={{ width: 120 }} />
            </div>
            <div>
              <label>Method</label>
              <select name="method" defaultValue={b.paymentMethod ?? "cash"}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m === "eft" ? "EFT" : m[0].toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <button className="btn">{b.paidCents > 0 ? "Update payment" : "Record payment"}</button>
          </form>
          {b.paidCents > 0 && (
            <form action={clearPayment} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={b.id} />
              <button className="btn sm secondary">Remove payment</button>
            </form>
          )}
          <p className="muted small">Recording a payment for a past booking also marks it as done.</p>
        </div>
      )}
    </>
  );
}
