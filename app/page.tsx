import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getActiveServices, getBusiness } from "@/lib/booking";
import { money } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [biz, services] = await Promise.all([getBusiness(), getActiveServices()]);

  return (
    <>
      <SiteHeader name={biz.name} />
      <main className="container">
        <section className="hero">
          <h1>{biz.name}</h1>
          <p className="muted">{biz.address}</p>
          <Link href="/book" className="btn" style={{ marginTop: 12 }}>
            Book an appointment
          </Link>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Services</h2>
          <div className="option-list">
            {services.map((s) => (
              <Link key={s.id} href={`/book?service=${s.id}`} className="option" style={{ textDecoration: "none" }}>
                <div>
                  <strong>{s.name}</strong>
                  <div className="muted small">
                    {s.description ? `${s.description} · ` : ""}
                    {s.durationMin} min
                  </div>
                </div>
                <span className="price">{money(s.priceCents)}</span>
              </Link>
            ))}
          </div>
        </section>

        <p className="center muted small" style={{ marginTop: 32 }}>
          {biz.phone} · <Link href="/admin">Staff login</Link>
        </p>
      </main>
    </>
  );
}
