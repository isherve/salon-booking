import Link from "next/link";
import { listCustomers } from "@/lib/admin-queries";
import { getBusiness } from "@/lib/booking";
import { fmtDate } from "@/lib/time";
import { requireUser } from "@/lib/auth";
import { scopeStaffId } from "@/lib/permissions";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await requireUser();
  const staffId = scopeStaffId(user);
  const [biz, rows] = await Promise.all([getBusiness(), listCustomers(q?.trim() || undefined, staffId)]);

  return (
    <>
      <h1>{staffId ? "My clients" : "Customers"}</h1>
      <form className="row" style={{ marginBottom: 16, maxWidth: 480 }}>
        <input name="q" placeholder="Search name, email or phone" defaultValue={q} style={{ flex: 1 }} />
        <button className="btn secondary">Search</button>
      </form>
      <div className="card">
        {!rows.length ? (
          <p className="muted">No customers yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Completed visits</th><th>Bookings</th><th>No-shows</th><th>Last visit</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/admin/customers/${c.id}`}>{c.name}</Link></td>
                    <td className="small">{c.phone}<br />{c.email}</td>
                    <td>{c.visits}</td>
                    <td>{c.total}</td>
                    <td>{c.noShows > 0 ? <span className="badge NO_SHOW">{c.noShows}</span> : 0}</td>
                    <td className="small">{c.lastVisit ? fmtDate(c.lastVisit, biz.timezone) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
