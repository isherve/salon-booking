import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBusiness } from "@/lib/booking";
import { exportRows, resolveRange } from "@/lib/finance";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything; neutralise formula injection in Excel
  const isNumber = /^-?\d+(\.\d+)?$/.test(s);
  const safe = !isNumber && /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

// GET /admin/finance/export?range=this-month  -> CSV of payments + expenses
export async function GET(req: Request) {
  if (!can(await getCurrentUser(), "finance")) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const biz = await getBusiness();
  const r = resolveRange(biz.timezone, url.searchParams.get("range") ?? undefined, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const { paid, exp } = await exportRows(r);

  const lines = [["Type", "Date", "Customer / Category", "Service / Description", "Staff", "Method", "Amount (R)"].map(cell).join(",")];
  for (const b of paid) {
    lines.push(
      ["Income", fmtDateTime(b.paidAt!, biz.timezone), b.customer.name, b.service.name, b.staff.name, b.paymentMethod, (b.paidCents / 100).toFixed(2)].map(cell).join(",")
    );
  }
  for (const e of exp) {
    lines.push(["Expense", e.date, e.category, e.description, "", "", (-e.amountCents / 100).toFixed(2)].map(cell).join(","));
  }
  const income = paid.reduce((a, b) => a + b.paidCents, 0);
  const spent = exp.reduce((a, e) => a + e.amountCents, 0);
  lines.push("");
  lines.push(["Total income", "", "", "", "", "", (income / 100).toFixed(2)].map(cell).join(","));
  lines.push(["Total expenses", "", "", "", "", "", (-spent / 100).toFixed(2)].map(cell).join(","));
  lines.push(["Profit", "", "", "", "", "", ((income - spent) / 100).toFixed(2)].map(cell).join(","));

  // BOM so Excel opens UTF-8 correctly
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance_${r.start}_to_${r.end}.csv"`,
    },
  });
}
