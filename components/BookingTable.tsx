import Link from "next/link";
import BookingActions from "./BookingActions";
import type { BookingRow } from "@/lib/admin-queries";
import { fmtDate, fmtTime, money } from "@/lib/time";

export function PaymentBadge({ paid, price, status }: { paid: number; price: number; status: string }) {
  if (paid >= price && paid > 0) return <span className="badge PAID">Paid</span>;
  if (paid > 0) return <span className="badge PART">Part-paid {money(paid)}</span>;
  if (status === "COMPLETED") return <span className="badge UNPAID">Unpaid</span>;
  return null;
}

export default function BookingTable({
  rows,
  tz,
  returnTo,
  showDate = true,
  empty = "No bookings.",
}: {
  rows: BookingRow[];
  tz: string;
  returnTo: string;
  showDate?: boolean;
  empty?: string;
}) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const now = new Date();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{showDate ? "When" : "Time"}</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Staff</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>
                <Link href={`/admin/bookings/${b.id}`}>
                  {showDate && <div className="small">{fmtDate(b.startsAt, tz)}</div>}
                  <strong>{fmtTime(b.startsAt, tz)}</strong>
                </Link>
              </td>
              <td>
                <div>{b.customer.name}</div>
                <div className="muted small">{b.customer.phone ?? b.customer.email}</div>
              </td>
              <td>
                {b.service.name}
                <div className="muted small">{money(b.priceCents)}{b.source === "admin" ? " · walk-in/phone" : ""}</div>
              </td>
              <td>{b.staff.name}</td>
              <td>
                <span className={`badge ${b.status}`}>{b.status.replace("_", " ")}</span>{" "}
                <PaymentBadge paid={b.paidCents} price={b.priceCents} status={b.status} />
              </td>
              <td>
                <BookingActions id={b.id} status={b.status} isPast={b.startsAt < now} returnTo={returnTo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
