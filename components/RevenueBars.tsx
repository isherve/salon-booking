import { addDaysStr, money } from "@/lib/time";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (key: string) => {
  const [, m, d] = key.split("-");
  return d ? `${Number(d)} ${MONTHS[Number(m) - 1]}` : `${MONTHS[Number(m) - 1]} ${key.slice(0, 4)}`;
};

/**
 * Money collected per day (or per month for long ranges).
 * Single series -> one brand colour, no legend; hover each bar for the exact value.
 */
export default function RevenueBars({ daily, start, end }: { daily: { day: string; total: number }[]; start: string; end: string }) {
  const byDay = new Map(daily.map((d) => [d.day, d.total]));
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 400; d = addDaysStr(d, 1)) days.push(d);

  // Long ranges are easier to read per month
  let points: { key: string; total: number }[];
  if (days.length > 62) {
    const months = new Map<string, number>();
    for (const d of days) months.set(d.slice(0, 7), (months.get(d.slice(0, 7)) ?? 0) + (byDay.get(d) ?? 0));
    points = [...months.entries()].map(([key, total]) => ({ key, total }));
  } else {
    points = days.map((d) => ({ key: d, total: byDay.get(d) ?? 0 }));
  }

  const max = Math.max(0, ...points.map((p) => p.total));
  const unit = days.length > 62 ? "month" : "day";

  if (max === 0) return <p className="muted">No payments recorded in this period yet.</p>;

  return (
    <figure style={{ margin: 0 }} aria-label={`Money collected per ${unit}`}>
      <div className="bars">
        <div className="bars-gridline" />
        <span className="bars-gridlabel">{money(max)}</span>
        {points.map((p) => (
          <div key={p.key} className="bar-col" tabIndex={0} aria-label={`${label(p.key)}: ${money(p.total)}`}>
            <div className="bar" style={{ height: `${(p.total / max) * 100}%` }} />
            <span className="tip">
              <strong>{money(p.total)}</strong> · {label(p.key)}
            </span>
          </div>
        ))}
      </div>
      <div className="bars-axis">
        <span>{label(points[0].key)}</span>
        {points.length > 2 && <span>{label(points[Math.floor(points.length / 2)].key)}</span>}
        <span>{label(points[points.length - 1].key)}</span>
      </div>
    </figure>
  );
}
