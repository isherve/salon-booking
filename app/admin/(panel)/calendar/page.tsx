import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { db, schema } from "@/db";
import { listBookings } from "@/lib/admin-queries";
import { getActiveStaff, getBusiness } from "@/lib/booking";
import { addDaysStr, fmtTime, isDateStr, localToUtc, todayIn, weekdayOf } from "@/lib/time";
import { requireUser } from "@/lib/auth";
import { scopeStaffId } from "@/lib/permissions";

const PX_PER_MIN = 1.1;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ start?: string; staff?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const own = scopeStaffId(user);
  const biz = await getBusiness();
  const tz = biz.timezone;
  const today = todayIn(tz);

  // Week starts on Monday
  const anchor = isDateStr(sp.start) ? sp.start : today;
  const monday = addDaysStr(anchor, -((weekdayOf(anchor) + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));

  const [allStaff, allHours] = await Promise.all([getActiveStaff(), db.select().from(schema.workingHours)]);
  const staffList = own ? allStaff.filter((s) => s.id === own) : allStaff;
  const hours = own ? allHours.filter((h) => h.staffId === own) : allHours;
  const staffFilter = own ?? (staffList.some((s) => s.id === sp.staff) ? sp.staff : undefined);

  const rows = (
    await listBookings({
      from: localToUtc(monday, 0, tz),
      to: localToUtc(addDaysStr(monday, 7), 0, tz),
      statuses: ["CONFIRMED", "COMPLETED", "NO_SHOW"],
      limit: 1000,
    })
  ).filter((b) => !staffFilter || b.staffId === staffFilter);

  // Visible hour range = earliest opening to latest closing (and any bookings outside that)
  const localMin = (d: Date) => {
    const [h, m] = formatInTimeZone(d, tz, "H:m").split(":").map(Number);
    return h * 60 + m;
  };
  let startH = Math.floor(Math.min(8 * 60, ...hours.map((h) => h.startMin), ...rows.map((b) => localMin(b.startsAt))) / 60);
  let endH = Math.ceil(Math.max(17 * 60, ...hours.map((h) => h.endMin), ...rows.map((b) => localMin(b.startsAt) + b.service.durationMin)) / 60);
  startH = Math.max(0, startH);
  endH = Math.min(24, endH);
  const height = (endH - startH) * 60 * PX_PER_MIN;
  const staffIndex = new Map(staffList.map((s, i) => [s.id, i]));
  // When showing all staff, each staff member gets their own lane in the day column
  const lanes = staffFilter ? 1 : Math.max(1, staffList.length);
  const qs = (start: string) => `/admin/calendar?start=${start}${staffFilter ? `&staff=${staffFilter}` : ""}`;

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          {formatInTimeZone(localToUtc(monday, 12 * 60, tz), tz, "d MMM")} – {formatInTimeZone(localToUtc(days[6], 12 * 60, tz), tz, "d MMM yyyy")}
        </h1>
        <div className="row">
          <Link className="btn sm secondary" href={qs(addDaysStr(monday, -7))}>← Prev</Link>
          <Link className="btn sm secondary" href={qs(today)}>This week</Link>
          <Link className="btn sm secondary" href={qs(addDaysStr(monday, 7))}>Next →</Link>
        </div>
      </div>

      {!own && <div className="row" style={{ marginBottom: 12 }}>
        <Link href={`/admin/calendar?start=${monday}`} className={`btn sm ${!staffFilter ? "" : "secondary"}`}>All staff</Link>
        {staffList.map((s) => (
          <Link key={s.id} href={`/admin/calendar?start=${monday}&staff=${s.id}`} className={`btn sm ${staffFilter === s.id ? "" : "secondary"}`}>
            {s.name}
          </Link>
        ))}
      </div>}

      {/* Each staff lane gets at least ~90px so names stay readable; scrolls sideways on small screens */}
      <div className="cal" style={{ gridTemplateColumns: `56px repeat(7, minmax(${Math.max(110, lanes * 90)}px, 1fr))` }}>
        <div className="cal-head" style={{ borderLeft: "none" }} />
        {days.map((d) => (
          <div key={d} className={`cal-head ${d === today ? "today" : ""}`}>
            {formatInTimeZone(localToUtc(d, 12 * 60, tz), tz, "EEE d")}
          </div>
        ))}

        <div className="cal-times" style={{ height }}>
          {Array.from({ length: endH - startH + 1 }, (_, i) => (
            <div key={i} className="cal-time" style={{ top: i * 60 * PX_PER_MIN, transform: i === 0 ? "none" : undefined }}>{String(startH + i).padStart(2, "0")}:00</div>
          ))}
        </div>

        {days.map((d) => {
          const dayRows = rows.filter((b) => formatInTimeZone(b.startsAt, tz, "yyyy-MM-dd") === d);
          return (
            <div key={d} className="cal-day" style={{ height }}>
              {Array.from({ length: endH - startH }, (_, i) => (
                <div key={i} className="cal-line" style={{ top: i * 60 * PX_PER_MIN }} />
              ))}
              {dayRows.map((b) => {
                const top = (localMin(b.startsAt) - startH * 60) * PX_PER_MIN;
                const h = Math.max(22, b.service.durationMin * PX_PER_MIN - 2);
                const idx = staffIndex.get(b.staffId) ?? 0;
                const cls = b.status === "CONFIRMED" ? `staff-${idx % 4}` : b.status;
                const lane = lanes === 1 ? 0 : idx % lanes;
                const pos = { top, height: h, left: `calc(${(lane * 100) / lanes}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: "auto" };
                return (
                  <Link key={b.id} href={`/admin/bookings/${b.id}`} className={`cal-event ${cls}`} style={pos} title={`${b.customer.name} – ${b.service.name} (${b.staff.name})`}>
                    <strong>{fmtTime(b.startsAt, tz)} {b.customer.name}</strong>
                    {b.service.name} · {b.staff.name}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="muted small">{lanes > 1 && <>Lanes left→right: {staffList.map((s) => s.name).join(", ")}. </>}Colours show staff members. Blue = completed, red = no-show. Click a booking for details.</p>
    </>
  );
}
