/**
 * Seeds demo data: one salon, 3 services, 2 staff with working hours.
 * Run with: npm run db:seed   (safe to re-run: it only seeds an empty database)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const existing = await db.select().from(schema.business).limit(1);
  if (existing.length) {
    console.log("Database already has data. Skipping seed.");
    await pool.end();
    return;
  }

  await db.insert(schema.business).values({
    name: "Glow Hair Studio",
    phone: "+27 11 000 0000",
    address: "12 Main Road, Johannesburg",
    timezone: "Africa/Johannesburg",
  });

  await db.insert(schema.services).values([
    { name: "Haircut & Style", description: "Wash, cut and blow-dry", durationMin: 45, bufferMin: 15, priceCents: 25000 },
    { name: "Braids", description: "Box braids, medium length", durationMin: 180, bufferMin: 15, priceCents: 65000 },
    { name: "Hair Colour", description: "Full colour treatment", durationMin: 90, bufferMin: 15, priceCents: 45000 },
    { name: "Beard Trim", description: "Shape and line-up", durationMin: 20, bufferMin: 10, priceCents: 10000 },
  ]);

  const [amara, thabo] = await db
    .insert(schema.staff)
    .values([{ name: "Amara" }, { name: "Thabo" }])
    .returning();

  const hours: (typeof schema.workingHours.$inferInsert)[] = [];
  // Amara: Mon-Fri 09:00-13:00 and 14:00-17:00 (lunch break), Sat 09:00-14:00
  for (const d of [1, 2, 3, 4, 5]) {
    hours.push({ staffId: amara.id, weekday: d, startMin: 9 * 60, endMin: 13 * 60 });
    hours.push({ staffId: amara.id, weekday: d, startMin: 14 * 60, endMin: 17 * 60 });
  }
  hours.push({ staffId: amara.id, weekday: 6, startMin: 9 * 60, endMin: 14 * 60 });
  // Thabo: Tue-Sat 10:00-18:00
  for (const d of [2, 3, 4, 5, 6]) {
    hours.push({ staffId: thabo.id, weekday: d, startMin: 10 * 60, endMin: 18 * 60 });
  }
  await db.insert(schema.workingHours).values(hours);

  console.log("✅ Seeded: Glow Hair Studio, 4 services, 2 staff members.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
