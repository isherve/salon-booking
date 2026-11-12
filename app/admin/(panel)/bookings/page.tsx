import Link from "next/link";
import BookingTable from "@/components/BookingTable";
import { listBookings } from "@/lib/admin-queries";
import { getBusiness } from "@/lib/booking";
import { requireUser } from "@/lib/auth";
import { scopeStaffId } from "@/lib/permissions";

const views = {
  upcoming: { label: "Upcoming", statuses: ["CONFIRMED"] as const, future: true },
  past: { label: "Past", statuses: ["CONFIRMED", "COMPLETED", "NO_SHOW"] as const, future: false },
  cancelled: { label: "Cancelled", statuses: ["CANCELLED"] as const, future: null },
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; error?: string; created?: string }>;
}) {
  const sp = await searchParams;
  const key = (sp.view && sp.view in views ? sp.view : "upcoming") as keyof typeof views;
  const v = views[key];
  const user = await requireUser();
  const staffId = scopeStaffId(user);
  const biz = await getBusiness();
  const now = new Date();

  const rows = await listBookings({
    statuses: [...v.statuses],
    from: v.future === true ? now : undefined,
    to: v.future === false ? now : undefined,
    order: v.future === true ? "asc" : "desc",
    staffId,
  });

  return (
    <>
      <div className="row between">
        <h1>{staffId ? "My bookings" : "Bookings"}</h1>
        <Link href="/admin/bookings/new" className="btn">+ New booking</Link>
      </div>
      {sp.created && <div className="alert success">Booking created.</div>}
      {sp.error && <div className="alert error">{sp.error}</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        {Object.entries(views).map(([k, val]) => (
          <Link key={k} href={`/admin/bookings?view=${k}`} className={`btn sm ${k === key ? "" : "secondary"}`}>
            {val.label}
          </Link>
        ))}
      </div>

      <div className="card">
        <BookingTable rows={rows} tz={biz.timezone} returnTo={`/admin/bookings?view=${key}`} />
      </div>
    </>
  );
}
