import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js uses .env.local, so load it for drizzle-kit too.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
