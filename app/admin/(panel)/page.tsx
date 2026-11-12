import Link from "next/link";
import BookingTable from "@/components/BookingTable";
import { dashboardStats, listBookings } from "@/lib/admin-queries";
import { getBusiness } from "@/lib/booking";
import { requireUser } from "@/lib/auth";
import { can, scopeStaffId } from "@/lib/permissions";
import { addDaysStr, fmtDate, localToUtc, money, todayIn } from "@/lib/time";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  const staffId = scopeStaffId(user); // undefined = whole business
  const biz = await getBusiness();
  const tz = biz.timezone;
  const now = new Date();
  const today = todayIn(tz, now);
  const todayStart = localToUtc(today, 0, tz);
  const todayEnd = localToUtc(addDaysStr(today, 1), 0, tz);
  const monthFirst = today.slice(0, 8) + "01";
  const [y, m] = today.split("-").map(Number);
  const nextMonthFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const [stats, todays, upcoming] = await Promise.all([
    dashboardStats(now, todayStart, todayEnd, localToUtc(monthFirst, 0, tz), localToUtc(nextMonthFirst, 0, tz), staffId),
    listBookings({ from: todayStart, to: todayEnd, statuses: ["CONFIRMED", "COMPLETED", "NO_SHOW"], staffId }),
    listBookings({ from: todayEnd, to: localToUtc(addDaysStr(today, 8), 0, tz), statuses: ["CONFIRMED"], limit: 20, staffId }),
  ]);

  return (
    <>
      <div className="row between">
        <h1>{staffId ? `Hi ${user.name.split(" ")[0]} · ` : "Today · "}{fmtDate(now, tz)}</h1>
        <Link href="/admin/bookings/new" className="btn">+ New booking</Link>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="stats">
        <div className="stat"><div className="label">Appointments today</div><div className="value">{stats.today}</div></div>
        <div className="stat"><div className="label">Upcoming (7 days)</div><div className="value">{stats.next7}</div></div>
        {can(user, "finance") ? (
          <Link href="/admin/finance" className="stat" style={{ color: "inherit", textDecoration: "none" }}><div className="label">Collected this month →</div><div className="value">{money(stats.monthRevenueCents)}</div></Link>
        ) : (
          <div className="stat"><div className="label">My takings this month</div><div className="value">{money(stats.monthRevenueCents)}</div></div>
        )}
        <div className="stat"><div className="label">No-show rate (30 days)</div><div className="value">{stats.noShowRate}%</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{staffId ? "My appointments today" : "Today\u2019s schedule"}</h2>
        <BookingTable rows={todays} tz={tz} returnTo="/admin" showDate={false} empty="No appointments today." />
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Coming up</h2>
          <Link href="/admin/calendar">Open calendar →</Link>
        </div>
        <BookingTable rows={upcoming} tz={tz} returnTo="/admin" empty="Nothing booked for the next week yet." />
      </div>
    </>
  );
}
