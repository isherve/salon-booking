/**
 * Fills the database with realistic DEMO data for every feature.
 *
 *   npm run db:demo            add demo data (safe to run once; re-running adds nothing twice)
 *   npm run db:demo -- --remove   delete the demo customers, bookings, expenses and accounts
 *
 * Your own owner account and existing data are never changed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomBytes, scrypt as scryptCb } from "crypto";
import { promisify } from "util";
import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { addDaysStr, localToUtc, todayIn, weekdayOf } from "../lib/time";

const DEMO_EMAIL_DOMAIN = "@demo.salon"; // demo customers & accounts use this
const DEMO_TAG = " (demo)"; // demo expenses end with this
const DEMO_PASSWORD = "Demo1234";

// ---------- deterministic random, so every run looks the same ----------
let seed = 20261112;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(pw, salt, 64)).toString("hex")}`;
}

const FIRST = ["Thandiwe", "Sipho", "Lerato", "Bongani", "Naledi", "Kagiso", "Zanele", "Tshepo", "Ayanda", "Mpho", "Nomvula", "Lwazi",
  "Palesa", "Thabiso", "Refilwe", "Siyabonga", "Karabo", "Nandi", "Lebo", "Andile", "Busisiwe", "Themba", "Dineo", "Kabelo",
  "Zinhle", "Lindani", "Ntombi", "Musa", "Keabetswe", "Jabu", "Chantelle", "Ruan", "Aisha", "Priya", "Liam", "Fatima",
  "Johan", "Megan", "Yusuf", "Tamsin"];
const LAST = ["Dlamini", "Nkosi", "Mokoena", "Ndlovu", "Khumalo", "Mahlangu", "Sithole", "Mabaso", "Molefe", "Zulu", "Mthembu",
  "Radebe", "Botha", "van der Merwe", "Naidoo", "Pillay", "Adams", "Petersen", "Mokwena", "Baloyi", "Shabalala", "Maseko"];

const NEW_SERVICES = [
  { name: "Fade & Line-up", description: "Skin or low fade with sharp line-up", durationMin: 40, bufferMin: 10, priceCents: 18000 },
  { name: "Kids Cut", description: "Under 12s", durationMin: 30, bufferMin: 10, priceCents: 12000 },
  { name: "Dreadlocks Retwist", description: "Retwist and style", durationMin: 120, bufferMin: 15, priceCents: 55000 },
  { name: "Wash & Blow-dry", description: "Wash, treatment and blow-dry", durationMin: 45, bufferMin: 10, priceCents: 20000 },
  { name: "Cornrows", description: "Straight-back cornrows", durationMin: 90, bufferMin: 15, priceCents: 30000 },
];

const NEW_STAFF: { name: string; hours: [number[], number, number][] }[] = [
  // [weekdays, start minute, end minute]
  { name: "Sipho", hours: [[[1, 2, 3, 4, 5, 6], 8 * 60, 16 * 60]] },
  { name: "Lerato", hours: [[[3, 4, 5, 6, 0], 10 * 60, 13 * 60], [[3, 4, 5, 6, 0], 14 * 60, 18 * 60]] },
];

const DEMO_USERS = [
  { name: "Nomsa Dlamini", email: "manager" + DEMO_EMAIL_DOMAIN, role: "MANAGER" as const, staff: null },
  { name: "Amara Nkosi", email: "amara" + DEMO_EMAIL_DOMAIN, role: "STAFF" as const, staff: "Amara" },
  { name: "Thabo Mokoena", email: "thabo" + DEMO_EMAIL_DOMAIN, role: "STAFF" as const, staff: "Thabo" },
  { name: "Sipho Khumalo", email: "sipho" + DEMO_EMAIL_DOMAIN, role: "STAFF" as const, staff: "Sipho" },
  { name: "Lerato Molefe", email: "lerato" + DEMO_EMAIL_DOMAIN, role: "STAFF" as const, staff: "Lerato" },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const s = schema;

  // ------------------------------------------------------------- remove
  if (process.argv.includes("--remove")) {
    const demoCustomers = await db.select({ id: s.customers.id }).from(s.customers).where(like(s.customers.email, "%" + DEMO_EMAIL_DOMAIN));
    const ids = demoCustomers.map((c) => c.id);
    if (ids.length) {
      await db.delete(s.bookings).where(inArray(s.bookings.customerId, ids));
      await db.delete(s.customers).where(inArray(s.customers.id, ids));
    }
    await db.delete(s.expenses).where(like(s.expenses.description, "%" + DEMO_TAG));
    await db.delete(s.users).where(like(s.users.email, "%" + DEMO_EMAIL_DOMAIN));
    await db.delete(s.timeOff).where(like(s.timeOff.reason, "%" + DEMO_TAG));
    console.log(`🧹 Removed demo data (${ids.length} customers and their bookings, demo expenses, demo accounts).`);
    console.log("   Demo staff & services were kept. Deactivate them under Staff & hours / Services if you don't want them.");
    await pool.end();
    return;
  }

  const [biz] = await db.select().from(s.business).limit(1);
  if (!biz) throw new Error("No business yet. Run: npm run db:setup");
  const tz = biz.timezone;

  const already = await db.select({ id: s.customers.id }).from(s.customers).where(like(s.customers.email, "%" + DEMO_EMAIL_DOMAIN)).limit(1);
  if (already.length) {
    console.log("Demo data is already there. To start over: npm run db:demo -- --remove   then   npm run db:demo");
    await pool.end();
    return;
  }

  // ------------------------------------------------------------- services
  const existingServices = await db.select().from(s.services);
  const toAdd = NEW_SERVICES.filter((n) => !existingServices.some((e) => e.name === n.name));
  if (toAdd.length) await db.insert(s.services).values(toAdd);
  const services = (await db.select().from(s.services)).filter((x) => x.active);

  // ------------------------------------------------------------- staff + hours
  for (const ns of NEW_STAFF) {
    const [exists] = await db.select().from(s.staff).where(eq(s.staff.name, ns.name));
    if (exists) continue;
    const [row] = await db.insert(s.staff).values({ name: ns.name }).returning();
    await db.insert(s.workingHours).values(
      ns.hours.flatMap(([days, startMin, endMin]) => days.map((weekday) => ({ staffId: row.id, weekday, startMin, endMin })))
    );
  }
  const staff = (await db.select().from(s.staff)).filter((x) => x.active);
  const hours = await db.select().from(s.workingHours);
  const today = todayIn(tz);

  // a few days off (shows up in the calendar & blocks online booking)
  const lerato = staff.find((x) => x.name === "Lerato");
  const thabo = staff.find((x) => x.name === "Thabo");
  const offs = [
    lerato && { staffId: lerato.id, from: addDaysStr(today, 5), to: addDaysStr(today, 6), reason: "Family wedding" + DEMO_TAG },
    thabo && { staffId: thabo.id, from: addDaysStr(today, -20), to: addDaysStr(today, -18), reason: "Sick leave" + DEMO_TAG },
  ].filter(Boolean) as { staffId: string; from: string; to: string; reason: string }[];
  for (const o of offs) {
    await db.insert(s.timeOff).values({ staffId: o.staffId, startsAt: localToUtc(o.from, 0, tz), endsAt: localToUtc(o.to, 1439, tz), reason: o.reason });
  }
  const timeOff = await db.select().from(s.timeOff);

  // ------------------------------------------------------------- customers
  const used = new Set<string>();
  const customerRows: (typeof s.customers.$inferInsert)[] = [];
  while (customerRows.length < 70) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (used.has(name)) continue;
    used.add(name);
    const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
    customerRows.push({
      name,
      // every demo customer gets a demo email so they can be removed later
      email: `${slug}${DEMO_EMAIL_DOMAIN}`,
      phone: chance(0.85) ? `0${pick(["6", "7", "8"])}${between(1, 9)} ${between(100, 999)} ${between(1000, 9999)}` : null,
    });
  }
  const customers = await db.insert(s.customers).values(customerRows).returning();
  // regulars come back often, others rarely
  const weighted = customers.flatMap((c, i) => Array(i < 15 ? 6 : i < 40 ? 2 : 1).fill(c));

  // ------------------------------------------------------------- bookings
  const existing = await db.select({ staffId: s.bookings.staffId, start: s.bookings.startsAt, end: s.bookings.endsAt, status: s.bookings.status }).from(s.bookings);
  const busy = new Map<string, { start: Date; end: Date }[]>();
  for (const b of existing) if (b.status !== "CANCELLED") busy.set(b.staffId, [...(busy.get(b.staffId) ?? []), { start: b.start, end: b.end }]);
  for (const t of timeOff) busy.set(t.staffId, [...(busy.get(t.staffId) ?? []), { start: t.startsAt, end: t.endsAt }]);
  const overlaps = (staffId: string, a: Date, b: Date) => (busy.get(staffId) ?? []).some((x) => a < x.end && b > x.start);

  const now = new Date();
  const rows: (typeof s.bookings.$inferInsert)[] = [];
  const methods = ["card", "card", "card", "cash", "cash", "eft", "eft"] as const;

  for (let offset = -60; offset <= 14; offset++) {
    const date = addDaysStr(today, offset);
    const wd = weekdayOf(date);
    const busyness = offset < 0 ? 0.62 : 0.38 - offset * 0.015; // further ahead = emptier
    for (const st of staff) {
      for (const range of hours.filter((h) => h.staffId === st.id && h.weekday === wd).sort((a, b) => a.startMin - b.startMin)) {
        let t = range.startMin;
        while (t < range.endMin) {
          if (!chance(busyness)) { t += pick([15, 30, 45]); continue; }
          const fits = services.filter((sv) => t + sv.durationMin <= range.endMin);
          if (!fits.length) break;
          // short services are more common than long ones
          const sv = pick(fits.flatMap((x) => Array(x.durationMin <= 45 ? 4 : x.durationMin <= 90 ? 2 : 1).fill(x)));
          const start = localToUtc(date, t, tz);
          const end = new Date(start.getTime() + (sv.durationMin + sv.bufferMin) * 60_000);
          t += sv.durationMin + sv.bufferMin;
          if (overlaps(st.id, start, end)) continue;
          if (start > now && start.getTime() - now.getTime() < 2 * 3600_000) continue; // keep near-future slots free

          const past = end < now;
          const r = rand();
          const status = past ? (r < 0.85 ? "COMPLETED" : r < 0.93 ? "NO_SHOW" : "CANCELLED") : r < 0.9 ? "CONFIRMED" : "CANCELLED";
          let paidCents = 0, paymentMethod: string | null = null, paidAt: Date | null = null;
          if (status === "COMPLETED") {
            const p = rand();
            if (p < 0.9) paidCents = sv.priceCents; // fully paid
            else if (p < 0.94) paidCents = Math.round(sv.priceCents / 2 / 100) * 100; // part-paid
            if (paidCents) { paymentMethod = pick(methods); paidAt = new Date(end.getTime() - sv.bufferMin * 60_000); }
          }
          const customer = pick(weighted);
          rows.push({
            serviceId: sv.id,
            staffId: st.id,
            customerId: customer.id,
            startsAt: start,
            endsAt: end,
            status,
            priceCents: sv.priceCents,
            paidCents,
            paymentMethod,
            paidAt,
            source: chance(0.7) ? "online" : "admin",
            notes: chance(0.08) ? pick(["Prefers a skin fade", "Sensitive scalp", "Running 10 min late", "First visit", "Bring reference photo"]) : null,
            reminderSent: past,
            createdAt: new Date(start.getTime() - between(1, 10) * 864e5),
          });
          if (status !== "CANCELLED") busy.set(st.id, [...(busy.get(st.id) ?? []), { start, end }]);
        }
      }
    }
  }
  // insert in chunks; the database still rejects any overlap it finds
  for (let i = 0; i < rows.length; i += 200) await db.insert(s.bookings).values(rows.slice(i, i + 200)).onConflictDoNothing();

  // ------------------------------------------------------------- expenses (3 months)
  const expenseRows: (typeof s.expenses.$inferInsert)[] = [];
  for (let m = 0; m < 3; m++) {
    const [y, mo] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 - m, 1));
    const first = d.toISOString().slice(0, 10);
    const day = (n: number) => { const x = addDaysStr(first, n - 1); return x <= today ? x : null; };
    const add = (date: string | null, category: string, description: string, rands: number) =>
      date && expenseRows.push({ date, category, description: description + DEMO_TAG, amountCents: rands * 100 });
    add(day(1), "Rent", "Monthly rent", 8000);
    add(day(5), "Utilities", "Electricity", between(850, 1300));
    add(day(7), "Utilities", "Water & internet", between(600, 750));
    for (let k = 0; k < between(2, 4); k++) add(day(between(2, 27)), "Products & stock", pick(["Shampoo & conditioner order", "Hair colour stock", "Braiding hair", "Clipper blades & oil", "Towels & capes"]), between(600, 2400));
    if (chance(0.7)) add(day(between(3, 25)), "Marketing", pick(["Instagram ads", "Flyers", "Facebook boost"]), between(250, 800));
    add(day(25), "Salaries & commission", "Receptionist (part-time)", 3500);
  }
  expenseRows.push({ date: addDaysStr(today, -40), category: "Equipment", description: "New barber chair" + DEMO_TAG, amountCents: 420000 });
  if (expenseRows.length) await db.insert(s.expenses).values(expenseRows);

  // ------------------------------------------------------------- user accounts
  const hash = await hashPassword(DEMO_PASSWORD);
  const allUsers = await db.select().from(s.users);
  const created: string[] = [];
  for (const u of DEMO_USERS) {
    if (allUsers.some((x) => x.email === u.email)) continue;
    const st = u.staff ? staff.find((x) => x.name === u.staff) : null;
    if (u.staff && !st) continue;
    if (st && allUsers.some((x) => x.staffId === st.id && x.active)) continue; // that barber already has a login
    await db.insert(s.users).values({ name: u.name, email: u.email, role: u.role, staffId: st?.id ?? null, passwordHash: hash });
    created.push(`   ${u.role === "MANAGER" ? "Manager" : "Barber "}  ${u.email.padEnd(22)} password: ${DEMO_PASSWORD}`);
  }

  const counts = await db.select({ status: s.bookings.status, customerId: s.bookings.customerId }).from(s.bookings)
    .where(inArray(s.bookings.customerId, customers.map((c) => c.id)));
  const by = (st: string) => counts.filter((c) => c.status === st).length;
  console.log("✅ Demo data added:");
  console.log(`   ${toAdd.length} new services, ${staff.length} staff in total, ${customers.length} customers`);
  console.log(`   ${counts.length} bookings: ${by("COMPLETED")} completed, ${by("CONFIRMED")} upcoming, ${by("NO_SHOW")} no-shows, ${by("CANCELLED")} cancelled`);
  console.log(`   ${expenseRows.length} expenses over 3 months`);
  if (created.length) {
    console.log("\n🔑 Demo logins (at /admin):");
    created.forEach((l) => console.log(l));
  }
  console.log("\nTo delete it again: npm run db:demo -- --remove");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
