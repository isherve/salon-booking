import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { saveService, toggleService } from "../../actions";
import { money } from "@/lib/time";
import { requirePerm } from "@/lib/auth";

type Svc = typeof schema.services.$inferSelect;

function ServiceForm({ s }: { s?: Svc }) {
  return (
    <form action={saveService} className="grid2" style={{ alignItems: "end" }}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="field">
        <label>Name</label>
        <input name="name" required defaultValue={s?.name} />
      </div>
      <div className="field">
        <label>Description</label>
        <input name="description" defaultValue={s?.description ?? ""} />
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Minutes</label>
          <input name="durationMin" type="number" min={5} step={5} required defaultValue={s?.durationMin ?? 30} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Cleanup min</label>
          <input name="bufferMin" type="number" min={0} step={5} defaultValue={s?.bufferMin ?? 0} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Price (R)</label>
          <input name="price" type="number" min={0} step="0.01" required defaultValue={s ? s.priceCents / 100 : ""} />
        </div>
      </div>
      <div className="field">
        <button className="btn">{s ? "Save" : "Add service"}</button>
      </div>
    </form>
  );
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePerm("services");
  const { error } = await searchParams;
  const services = await db.select().from(schema.services).orderBy(asc(schema.services.name));

  return (
    <>
      <h1>Services</h1>
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add a service</h2>
        <ServiceForm />
      </div>

      {services.map((s) => (
        <details key={s.id} className="card">
          <summary className="row between" style={{ cursor: "pointer", listStyle: "none" }}>
            <div>
              <strong>{s.name}</strong> {!s.active && <span className="badge CANCELLED">Hidden</span>}
              <div className="muted small">
                {s.durationMin} min + {s.bufferMin} min cleanup · {money(s.priceCents)}
              </div>
            </div>
            <span className="muted small">Edit ▾</span>
          </summary>
          <div style={{ marginTop: 16 }}>
            <ServiceForm s={s} />
            <form action={toggleService}>
              <input type="hidden" name="id" value={s.id} />
              <button className="btn sm secondary">{s.active ? "Hide from booking page" : "Show on booking page"}</button>
            </form>
          </div>
        </details>
      ))}
    </>
  );
}
