import { asc, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addHours, addStaff, addTimeOff, deleteHours, deleteTimeOff, toggleStaff } from "../../actions";
import { requireUser } from "@/lib/auth";
import { getBusiness } from "@/lib/booking";
import { can, scopeStaffId } from "@/lib/permissions";
import { fmtDate, minToHHMM } from "@/lib/time";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // show Monday first

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  const manage = can(user, "staff"); // managers/owner edit everyone; barbers see only themselves
  const own = scopeStaffId(user);
  const biz = await getBusiness();
  const [allStaff, hours, off] = await Promise.all([
    db.select().from(schema.staff).orderBy(asc(schema.staff.name)),
    db.select().from(schema.workingHours).orderBy(asc(schema.workingHours.startMin)),
    db.select().from(schema.timeOff).where(gte(schema.timeOff.endsAt, new Date())).orderBy(asc(schema.timeOff.startsAt)),
  ]);
  const staffList = own ? allStaff.filter((s) => s.id === own) : allStaff;

  return (
    <>
      <h1>{manage ? "Staff & working hours" : "My hours & time off"}</h1>
      {error && <div className="alert error">{error}</div>}
      {!manage && <p className="muted" style={{ marginTop: -12 }}>Ask a manager to change your weekly hours. You can add your own time off below.</p>}
      {!manage && staffList.length === 0 && <div className="alert warn">Your account isn&apos;t linked to a staff calendar yet. Ask the owner.</div>}

      {manage && (
        <form action={addStaff} className="card row" style={{ maxWidth: 520 }}>
          <input name="name" placeholder="New staff member's name" required style={{ flex: 1 }} />
          <button className="btn">Add staff</button>
        </form>
      )}

      {staffList.map((s) => {
        const mine = hours.filter((h) => h.staffId === s.id);
        const myOff = off.filter((o) => o.staffId === s.id);
        return (
          <div key={s.id} className="card">
            <div className="row between">
              <h2 style={{ margin: 0 }}>
                {s.name} {!s.active && <span className="badge CANCELLED">Inactive</span>}
              </h2>
              {manage && (
                <form action={toggleStaff}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn sm secondary">{s.active ? "Deactivate" : "Activate"}</button>
                </form>
              )}
            </div>

            <h3>Weekly hours</h3>
            <div className="hours-grid">
              {ORDER.map((d) => {
                const ranges = mine.filter((h) => h.weekday === d);
                return (
                  <div key={d} style={{ display: "contents" }}>
                    <strong className="small">{DAYS[d]}</strong>
                    <div>
                      {ranges.length === 0 && <span className="muted small">Closed</span>}
                      {ranges.map((r) =>
                        manage ? (
                          <form key={r.id} action={deleteHours} className="range">
                            <input type="hidden" name="id" value={r.id} />
                            {minToHHMM(r.startMin)}–{minToHHMM(r.endMin)}
                            <button className="x" title="Remove">×</button>
                          </form>
                        ) : (
                          <span key={r.id} className="range">{minToHHMM(r.startMin)}–{minToHHMM(r.endMin)}</span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {manage && (
              <form action={addHours} style={{ marginTop: 14 }}>
                <input type="hidden" name="staffId" value={s.id} />
                <div className="row small">
                  {ORDER.map((d) => (
                    <label key={d} style={{ fontWeight: 400, display: "flex", gap: 4, alignItems: "center", margin: 0 }}>
                      <input type="checkbox" name="weekday" value={d} style={{ width: "auto" }} /> {DAYS[d].slice(0, 3)}
                    </label>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <input type="time" name="start" defaultValue="09:00" required style={{ width: 130 }} />
                  <span>to</span>
                  <input type="time" name="end" defaultValue="17:00" required style={{ width: 130 }} />
                  <button className="btn sm">Add hours</button>
                </div>
                <p className="muted small">Tip: for a lunch break, add two ranges, e.g. 09:00–13:00 and 14:00–17:00.</p>
              </form>
            )}

            <h3>Time off</h3>
            {myOff.length === 0 && <p className="muted small">No upcoming time off.</p>}
            {myOff.map((o) => (
              <form key={o.id} action={deleteTimeOff} className="range">
                <input type="hidden" name="id" value={o.id} />
                {fmtDate(o.startsAt, biz.timezone)} → {fmtDate(o.endsAt, biz.timezone)} {o.reason && `· ${o.reason}`}
                <button className="x" title="Remove">×</button>
              </form>
            ))}
            <form action={addTimeOff} className="row" style={{ marginTop: 10 }}>
              <input type="hidden" name="staffId" value={s.id} />
              <input type="date" name="from" required style={{ width: 160 }} />
              <span>to</span>
              <input type="date" name="to" style={{ width: 160 }} />
              <input name="reason" placeholder="Reason (optional)" style={{ width: 180 }} />
              <button className="btn sm secondary">Add time off</button>
            </form>
          </div>
        );
      })}
    </>
  );
}
