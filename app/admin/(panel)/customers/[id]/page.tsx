import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import BookingTable from "@/components/BookingTable";
import { listBookings } from "@/lib/admin-queries";
import { getBusiness } from "@/lib/booking";
import { requireUser } from "@/lib/auth";
import { scopeStaffId } from "@/lib/permissions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  if (!c) notFound();
  const user = await requireUser();
  const staffId = scopeStaffId(user);
  const [biz, rows] = await Promise.all([getBusiness(), listBookings({ customerId: id, order: "desc", staffId })]);
  if (staffId && rows.length === 0) notFound(); // not one of their clients

  return (
    <>
      <p><Link href="/admin/customers">← All customers</Link></p>
      <h1>{c.name}</h1>
      <p className="muted" style={{ marginTop: -12 }}>
        {[c.phone, c.email].filter(Boolean).join(" · ")}
      </p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Booking history</h2>
        <BookingTable rows={rows} tz={biz.timezone} returnTo={`/admin/customers/${id}`} />
      </div>
    </>
  );
}
