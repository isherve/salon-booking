import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "crypto";
import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { can, type Permission } from "./permissions";

/**
 * Per-user login.
 * Cookie = userId.sessionVersion.issuedAt.signature (HMAC-SHA256).
 * The user is re-loaded from the database on every request, so deactivating
 * an account or changing a password (which bumps sessionVersion) logs them out.
 */
const COOKIE = "staff_session";
const MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("Set SESSION_SECRET in .env.local");
  return s;
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type SessionUser = typeof schema.users.$inferSelect;

export async function startSession(user: Pick<SessionUser, "id" | "sessionVersion">) {
  const payload = `${user.id}.${user.sessionVersion}.${Date.now()}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The logged-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [userId, version, issued, sig] = parts;
  if (!safeEqual(sig, sign(`${userId}.${version}.${issued}`))) return null;
  if (Date.now() - Number(issued) > MAX_AGE_S * 1000) return null;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user || !user.active || String(user.sessionVersion) !== version) return null;
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requirePerm(perm: Permission) {
  const user = await requireUser();
  if (!can(user, perm)) redirect("/admin?error=" + encodeURIComponent("You don't have access to that page."));
  return user;
}

export async function hasAnyUser() {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  return n > 0;
}
