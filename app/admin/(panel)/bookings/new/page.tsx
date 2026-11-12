import { createManualBooking } from "../../../actions";
import { getActiveServices, getActiveStaff, getBusiness } from "@/lib/booking";
import { money, todayIn } from "@/lib/time";
import { requireUser } from "@/lib/auth";
import { scopeStaffId } from "@/lib/permissions";

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ error?: string; date?: string; staff?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const own = scopeStaffId(user);
  const [biz, services, allStaff] = await Promise.all([getBusiness(), getActiveServices(), getActiveStaff()]);
  const staff = own ? allStaff.filter((s) => s.id === own) : allStaff;

  return (
    <>
      <h1>New booking</h1>
      <p className="muted" style={{ marginTop: -12 }}>
        For walk-ins and phone bookings. You can book outside normal hours, but never over another booking.
      </p>
      {sp.error && <div className="alert error">{sp.error}</div>}
      {own && staff.length === 0 && <div className="alert warn">Your account isn&apos;t linked to a staff calendar yet. Ask the owner.</div>}

      <form action={createManualBooking} className="card" style={{ maxWidth: 640 }}>
        <div className="grid2">
          <div className="field">
            <label>Service</label>
            <select name="serviceId" required>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min, {money(s.priceCents)})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Staff</label>
            <select name="staffId" required defaultValue={sp.staff}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" name="date" required defaultValue={sp.date ?? todayIn(biz.timezone)} />
          </div>
          <div className="field">
            <label>Time</label>
            <input type="time" name="time" required step={300} defaultValue="09:00" />
          </div>
        </div>

        <h3>Customer</h3>
        <div className="field">
          <label>Name</label>
          <input name="name" required minLength={2} />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Phone / WhatsApp</label>
            <input name="phone" type="tel" />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea name="notes" rows={2} />
        </div>
        <label style={{ fontWeight: 400, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="notify" defaultChecked style={{ width: "auto" }} /> Send the customer a confirmation
        </label>
        <button className="btn" style={{ marginTop: 16 }}>Create booking</button>
      </form>
    </>
  );
}
