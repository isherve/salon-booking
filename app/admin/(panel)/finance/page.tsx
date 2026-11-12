import Link from "next/link";
import RevenueBars from "@/components/RevenueBars";
import { addExpense, deleteExpense, recordPayment } from "../../actions";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/db/schema";
import { getBusiness } from "@/lib/booking";
import { financeReport, PRESETS, resolveRange } from "@/lib/finance";
import { fmtDate, money, todayIn } from "@/lib/time";
import { requirePerm } from "@/lib/auth";

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", eft: "EFT / bank transfer", other: "Other" };

function Breakdown({ rows, total, empty }: { rows: { name: string; total: number; n?: number }[]; total: number; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td style={{ width: "60%" }}>
              {r.name}
              {r.n !== undefined && <span className="muted small"> · {r.n}</span>}
              <div className="share-track"><div className="share" style={{ width: `${total ? (r.total / total) * 100 : 0}%` }} /></div>
            </td>
            <td className="num">{money(r.total)}</td>
            <td className="num muted small">{total ? Math.round((r.total / total) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; error?: string }>;
}) {
  await requirePerm("finance");
  const sp = await searchParams;
  const biz = await getBusiness();
  const tz = biz.timezone;
  const r = resolveRange(tz, sp.range, sp.from, sp.to);
  const f = await financeReport(r, tz);
  const qs = r.preset === "custom" ? `range=custom&from=${r.start}&to=${r.end}` : `range=${r.preset}`;
  const here = `/admin/finance?${qs}`;

  return (
    <>
      <div className="row between">
        <h1>Finance</h1>
        <a className="btn secondary" href={`/admin/finance/export?${qs}`}>⬇ Export CSV</a>
      </div>
      {sp.error && <div className="alert error">{sp.error}</div>}

      {/* Period filter — one row above everything */}
      <div className="row" style={{ marginBottom: 16 }}>
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[])
          .filter((k) => k !== "custom")
          .map((k) => (
            <Link key={k} href={`/admin/finance?range=${k}`} className={`btn sm ${r.preset === k ? "" : "secondary"}`}>
              {PRESETS[k]}
            </Link>
          ))}
        <form className="row" style={{ gap: 6 }}>
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" defaultValue={r.start} style={{ width: 150 }} />
          <span className="muted">to</span>
          <input type="date" name="to" defaultValue={r.end} style={{ width: 150 }} />
          <button className={`btn sm ${r.preset === "custom" ? "" : "secondary"}`}>Apply</button>
        </form>
      </div>
      <p className="muted small" style={{ marginTop: -8 }}>
        {fmtDate(r.fromUtc, tz)} – {fmtDate(new Date(r.toUtc.getTime() - 1), tz)} · income counted on the day it was paid
      </p>

      <div className="kpis">
        <div className="kpi">
          <div className="label">Money collected</div>
          <div className="value">{money(f.collectedCents)}</div>
          <div className="sub">{f.payments} payments · avg {money(f.avgTicketCents)}</div>
        </div>
        <div className="kpi">
          <div className="label">Expenses</div>
          <div className="value">{money(f.expenseCents)}</div>
          <div className="sub">{f.expenseList.length} entries</div>
        </div>
        <div className="kpi">
          <div className="label">Profit</div>
          <div className={`value ${f.profitCents < 0 ? "neg" : ""}`}>{f.profitCents < 0 ? "−" : ""}{money(Math.abs(f.profitCents))}</div>
          <div className="sub">collected − expenses</div>
        </div>
        <div className="kpi">
          <div className="label">Unpaid (completed visits)</div>
          <div className="value">{money(f.outstandingCents)}</div>
          <div className="sub">{f.outstanding.length} bookings, all dates</div>
        </div>
        <div className="kpi">
          <div className="label">Expected next 30 days</div>
          <div className="value">{money(f.expectedCents)}</div>
          <div className="sub">{f.expectedCount} confirmed bookings</div>
        </div>
        <div className="kpi">
          <div className="label">Lost to no-shows</div>
          <div className="value">{money(f.lost.noShowCents)}</div>
          <div className="sub">{f.lost.noShows} no-shows · {f.lost.cancelled} cancellations</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Money collected</h2>
        <RevenueBars daily={f.daily} start={r.start} end={r.end} />
      </div>

      <div className="cols2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>By service</h2>
          <Breakdown rows={f.byService.map((x) => ({ name: x.name, total: x.total, n: x.n }))} total={f.collectedCents} empty="No payments yet." />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>By staff member</h2>
          <Breakdown rows={f.byStaff.map((x) => ({ name: x.name, total: x.total, n: x.n }))} total={f.collectedCents} empty="No payments yet." />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>By payment method</h2>
          <Breakdown rows={f.byMethod.map((x) => ({ name: METHOD_LABEL[x.method ?? "other"] ?? "Other", total: x.total, n: x.n }))} total={f.collectedCents} empty="No payments yet." />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Expenses by category</h2>
          <Breakdown rows={f.byCategory.map((x) => ({ name: x.category, total: x.total }))} total={f.expenseCents} empty="No expenses in this period." />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Unpaid completed visits</h2>
        {!f.outstanding.length ? (
          <p className="muted">Everything is paid. 🎉</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Customer</th><th>Service</th><th className="num">Owed</th><th>Record payment</th></tr></thead>
              <tbody>
                {f.outstanding.map((b) => (
                  <tr key={b.id}>
                    <td className="small"><Link href={`/admin/bookings/${b.id}`}>{fmtDate(b.startsAt, tz)}</Link></td>
                    <td>{b.customer.name}</td>
                    <td>{b.service.name} <span className="muted small">· {b.staff.name}</span></td>
                    <td className="num">{money(b.priceCents - b.paidCents)}</td>
                    <td>
                      <form action={recordPayment} className="pay-form">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <input type="number" name="amount" step="0.01" min="0" defaultValue={b.priceCents / 100} style={{ width: 100 }} aria-label="Amount" />
                        <select name="method" defaultValue="cash" aria-label="Method">
                          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                        </select>
                        <button className="btn sm">Paid</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Expenses</h2>
        <form action={addExpense} className="pay-form" style={{ marginBottom: 16 }}>
          <input type="hidden" name="returnTo" value={here} />
          <div><label>Date</label><input type="date" name="date" required defaultValue={todayIn(tz)} /></div>
          <div>
            <label>Category</label>
            <select name="category">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}><label>Description</label><input name="description" placeholder="e.g. Shampoo order" style={{ width: "100%" }} /></div>
          <div><label>Amount (R)</label><input type="number" name="amount" step="0.01" min="0.01" required style={{ width: 120 }} /></div>
          <button className="btn">Add expense</button>
        </form>
        {!f.expenseList.length ? (
          <p className="muted small">No expenses in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {f.expenseList.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{e.date}</td>
                    <td>{e.category}</td>
                    <td className="muted">{e.description}</td>
                    <td className="num">{money(e.amountCents)}</td>
                    <td>
                      <form action={deleteExpense}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <button className="x" title="Delete expense">×</button>
                      </form>
                    </td>
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
