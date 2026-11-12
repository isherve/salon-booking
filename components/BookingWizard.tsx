"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Service = { id: string; name: string; description: string | null; durationMin: number; priceCents: number };
type Staff = { id: string; name: string };
type Slot = { start: string; staffIds: string[] };

interface Props {
  services: Service[];
  staff: Staff[];
  timezone: string;
  today: string; // YYYY-MM-DD in business tz
  maxDaysAhead: number;
  initialServiceId?: string;
  reschedule?: { token: string; bookingId: string; serviceId: string; staffId: string };
}

const money = (c: number) => `R${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function dateParts(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  return {
    dow: d.toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
    month: d.toLocaleDateString("en-ZA", { month: "short", timeZone: "UTC" }),
    long: d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  };
}

export default function BookingWizard(props: Props) {
  const router = useRouter();
  const { services, staff, timezone, today, reschedule } = props;
  const isReschedule = !!reschedule;

  const [step, setStep] = useState(isReschedule ? 2 : props.initialServiceId ? 1 : 0);
  const [serviceId, setServiceId] = useState(reschedule?.serviceId ?? props.initialServiceId ?? "");
  const [staffId, setStaffId] = useState<string>(reschedule?.staffId ?? "any");
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const service = services.find((s) => s.id === serviceId);
  const days = useMemo(
    () => Array.from({ length: Math.min(props.maxDaysAhead, 30) + 1 }, (_, i) => addDays(today, i)),
    [today, props.maxDaysAhead]
  );
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(iso));
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? "Any available";

  // Load free slots whenever service / staff / date changes
  useEffect(() => {
    if (step !== 2 || !serviceId) return;
    const ctrl = new AbortController();
    setLoadingSlots(true);
    setSlot(null);
    const qs = new URLSearchParams({ serviceId, date, staffId });
    if (reschedule) qs.set("exclude", reschedule.bookingId);
    fetch(`/api/availability?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch((e) => e.name !== "AbortError" && setError("Could not load times. Please refresh."))
      .finally(() => setLoadingSlots(false));
    return () => ctrl.abort();
  }, [step, serviceId, staffId, date, reschedule, reloadKey]);

  async function submit() {
    if (!slot || !service) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = isReschedule
        ? await fetch(`/api/bookings/${reschedule!.token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reschedule", startsAt: slot.start, staffId }),
          })
        : await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceId, staffId, startsAt: slot.start, ...form }),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        if (res.status === 409) {
          // slot taken: go back to time picker and refresh
          setStep(2);
          setReloadKey((k) => k + 1);
        }
        return;
      }
      router.push(`/booking/${isReschedule ? reschedule!.token : data.token}?${isReschedule ? "moved" : "new"}=1`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalSteps = isReschedule ? 1 : 4;
  const shownStep = isReschedule ? 0 : step;

  return (
    <div className="card">
      <div className="steps">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className={i <= shownStep ? "on" : ""} />
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}

      {/* STEP 0: service */}
      {step === 0 && (
        <>
          <h2 style={{ marginTop: 0 }}>Choose a service</h2>
          <div className="option-list">
            {services.map((s) => (
              <button
                key={s.id}
                className={`option ${s.id === serviceId ? "selected" : ""}`}
                onClick={() => { setServiceId(s.id); setStep(1); }}
              >
                <div>
                  <strong>{s.name}</strong>
                  <div className="muted small">{s.description ? `${s.description} · ` : ""}{s.durationMin} min</div>
                </div>
                <span className="price">{money(s.priceCents)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* STEP 1: staff */}
      {step === 1 && (
        <>
          <h2 style={{ marginTop: 0 }}>Who would you like?</h2>
          <div className="option-list">
            {[{ id: "any", name: "Any available" }, ...staff].map((s) => (
              <button
                key={s.id}
                className={`option ${s.id === staffId ? "selected" : ""}`}
                onClick={() => { setStaffId(s.id); setStep(2); }}
              >
                <strong>{s.name}</strong>
                {s.id === "any" && <span className="muted small">Most times available</span>}
              </button>
            ))}
          </div>
          <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => setStep(0)}>← Back</button>
        </>
      )}

      {/* STEP 2: date & time */}
      {step === 2 && service && (
        <>
          <h2 style={{ marginTop: 0 }}>{isReschedule ? "Pick a new time" : "Pick a date & time"}</h2>
          <p className="muted small" style={{ marginTop: -8 }}>
            {service.name} · {service.durationMin} min · {staffName(staffId)}
          </p>

          {isReschedule && (
            <div className="field" style={{ maxWidth: 260 }}>
              <label>Staff member</label>
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="any">Any available</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="dates">
            {days.map((d) => {
              const p = dateParts(d);
              return (
                <button key={d} className={`date-chip ${d === date ? "selected" : ""}`} onClick={() => setDate(d)}>
                  <div className="dow">{d === today ? "Today" : p.dow}</div>
                  <div className="day">{p.day}</div>
                  <div className="dow">{p.month}</div>
                </button>
              );
            })}
          </div>

          <p style={{ marginBottom: 0 }}><strong>{dateParts(date).long}</strong></p>
          {loadingSlots ? (
            <p className="muted"><span className="spinner" /> Loading times…</p>
          ) : slots.length === 0 ? (
            <div className="alert warn">No free times on this day. Try another date{staffId !== "any" ? " or choose “Any available”" : ""}.</div>
          ) : (
            <div className="slots">
              {slots.map((s) => (
                <button key={s.start} className={`slot ${slot?.start === s.start ? "selected" : ""}`} onClick={() => setSlot(s)}>
                  {fmtTime(s.start)}
                </button>
              ))}
            </div>
          )}

          <div className="row between" style={{ marginTop: 20 }}>
            {isReschedule ? (
              <button className="btn secondary" onClick={() => router.back()}>Cancel</button>
            ) : (
              <button className="btn secondary" onClick={() => setStep(1)}>← Back</button>
            )}
            {isReschedule ? (
              <button className="btn" disabled={!slot || submitting} onClick={submit}>
                {submitting ? "Saving…" : "Confirm new time"}
              </button>
            ) : (
              <button className="btn" disabled={!slot} onClick={() => setStep(3)}>Continue →</button>
            )}
          </div>
        </>
      )}

      {/* STEP 3: details */}
      {step === 3 && service && slot && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <h2 style={{ marginTop: 0 }}>Your details</h2>
          <dl className="summary">
            <dt>Service</dt><dd>{service.name} · {money(service.priceCents)}</dd>
            <dt>When</dt><dd>{dateParts(date).long} at {fmtTime(slot.start)}</dd>
            <dt>With</dt><dd>{staffId === "any" ? "First available stylist" : staffName(staffId)}</dd>
          </dl>
          <div style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="name">Full name *</label>
              <input id="name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="phone">Phone / WhatsApp</label>
                <input id="phone" type="tel" placeholder="082 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <p className="muted small" style={{ marginTop: -6 }}>Email or phone is required for your confirmation.</p>
            <div className="field">
              <label htmlFor="notes">Notes (optional)</label>
              <textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="row between">
            <button type="button" className="btn secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn" disabled={submitting || (!form.email && !form.phone)}>
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
