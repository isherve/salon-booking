"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { endSession, hasAnyUser, requirePerm, requireUser, startSession } from "@/lib/auth";
import { BookingError, createBooking, getBookingById, getBusiness } from "@/lib/booking";
import { notifyCustomer } from "@/lib/notify";
import { hashPassword, passwordProblem, tempPassword, verifyPassword } from "@/lib/password";
import { can, canAccessBooking, type Role } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { hhmmToMin, isDateStr, localToUtc } from "@/lib/time";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => Math.round(Number(fd.get(k)));
const uuidRe = /^[0-9a-f-]{36}$/i;
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: Role[] = ["OWNER", "MANAGER", "STAFF"];
const back = (path: string, error: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);

/** Loads a booking and checks the current user may touch it. */
async function bookingForUser(id: string, returnTo: string) {
  const user = await requireUser();
  if (!uuidRe.test(id)) back(returnTo, "Invalid request");
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id));
  if (!b || !canAccessBooking(user, b)) back(returnTo, "You can only change your own bookings.");
  return { user, booking: b! };
}

// =====================================================================
// Login, first-run setup, logout
// =====================================================================
export async function login(fd: FormData) {
  const ip = (await headers()).get("x-forwarded-for") ?? "local";
  const email = str(fd, "email").toLowerCase();
  if (!rateLimit("login:" + ip, 10, 15 * 60_000) || !rateLimit("login-email:" + email, 6, 15 * 60_000)) {
    back("/admin/login", "Too many attempts. Wait 15 minutes.");
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Same message whether the email or the password is wrong
  if (!user || !(await verifyPassword(str(fd, "password"), user.passwordHash))) back("/admin/login", "Wrong email or password");
  if (!user!.active) back("/admin/login", "This account has been deactivated. Ask the owner.");

  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user!.id));
  await startSession(user!);
  redirect("/admin");
}

export async function setupOwner(fd: FormData) {
  if (await hasAnyUser()) redirect("/admin/login");
  const ip = (await headers()).get("x-forwarded-for") ?? "local";
  if (!rateLimit("setup:" + ip, 8, 15 * 60_000)) back("/admin/login", "Too many attempts. Wait 15 minutes.");

  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!name || !emailRe.test(email)) back("/admin/login", "Enter your name and a valid email");
  const problem = passwordProblem(password);
  if (problem) back("/admin/login", problem);

  const [user] = await db
    .insert(schema.users)
    .values({ name, email, passwordHash: await hashPassword(password), role: "OWNER" })
    .returning();
  await startSession(user);
  redirect("/admin/team?welcome=1");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

// =====================================================================
// My account
// =====================================================================
export async function changeMyPassword(fd: FormData) {
  const user = await requireUser();
  if (!(await verifyPassword(str(fd, "current"), user.passwordHash))) back("/admin/account", "Your current password is wrong");
  const next = str(fd, "next");
  const problem = passwordProblem(next);
  if (problem) back("/admin/account", problem);
  if (next !== str(fd, "confirm")) back("/admin/account", "The new passwords don't match");

  const version = user.sessionVersion + 1; // logs out other devices
  await db.update(schema.users).set({ passwordHash: await hashPassword(next), sessionVersion: version }).where(eq(schema.users.id, user.id));
  await startSession({ id: user.id, sessionVersion: version });
  redirect("/admin/account?saved=1");
}

// =====================================================================
// Team (user accounts) — owner only
// =====================================================================
async function activeOwnerCount(excludeId?: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, "OWNER"), eq(schema.users.active, true), excludeId ? ne(schema.users.id, excludeId) : undefined));
  return n;
}

export async function createUser(fd: FormData) {
  await requirePerm("team");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const role = str(fd, "role") as Role;
  const staffId = str(fd, "staffId") || null;
  if (!name || !emailRe.test(email) || !ROLES.includes(role)) back("/admin/team", "Enter a name, a valid email and a role");
  if (role === "STAFF" && !staffId) back("/admin/team", "Link a barber/stylist account to their calendar (staff member)");
  if (staffId && !uuidRe.test(staffId)) back("/admin/team", "Invalid staff member");

  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) back("/admin/team", "An account with that email already exists");

  const password = str(fd, "password") || tempPassword();
  const problem = passwordProblem(password);
  if (problem) back("/admin/team", problem);

  await db.insert(schema.users).values({ name, email, role, staffId, passwordHash: await hashPassword(password) });
  redirect(`/admin/team?created=${encodeURIComponent(email)}&pw=${encodeURIComponent(password)}`);
}

export async function updateUser(fd: FormData) {
  const me = await requirePerm("team");
  const id = str(fd, "id");
  const role = str(fd, "role") as Role;
  const staffId = str(fd, "staffId") || null;
  if (!uuidRe.test(id) || !ROLES.includes(role)) back("/admin/team", "Invalid request");
  if (role === "STAFF" && !staffId) back("/admin/team", "A barber/stylist account must be linked to a staff member");

  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) back("/admin/team", "User not found");
  if (u!.role === "OWNER" && role !== "OWNER" && (await activeOwnerCount(id)) === 0) {
    back("/admin/team", "There must always be at least one owner");
  }
  if (id === me.id && role !== "OWNER") back("/admin/team", "You can't remove your own owner role. Ask another owner.");

  await db
    .update(schema.users)
    .set({ role, staffId, sessionVersion: u!.role !== role ? u!.sessionVersion + 1 : u!.sessionVersion })
    .where(eq(schema.users.id, id));
  redirect("/admin/team?saved=1");
}

export async function toggleUserActive(fd: FormData) {
  const me = await requirePerm("team");
  const id = str(fd, "id");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) back("/admin/team", "User not found");
  if (id === me.id) back("/admin/team", "You can't deactivate your own account");
  if (u!.active && u!.role === "OWNER" && (await activeOwnerCount(id)) === 0) back("/admin/team", "There must always be at least one owner");

  await db
    .update(schema.users)
    .set({ active: !u!.active, sessionVersion: u!.sessionVersion + 1 }) // logs them out immediately
    .where(eq(schema.users.id, id));
  redirect("/admin/team?saved=1");
}

export async function resetUserPassword(fd: FormData) {
  await requirePerm("team");
  const id = str(fd, "id");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) back("/admin/team", "User not found");
  const password = tempPassword();
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), sessionVersion: u!.sessionVersion + 1 })
    .where(eq(schema.users.id, id));
  redirect(`/admin/team?reset=${encodeURIComponent(u!.email)}&pw=${encodeURIComponent(password)}`);
}

// =====================================================================
// Bookings
// =====================================================================
const STATUSES = ["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;

export async function setBookingStatus(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status") as (typeof STATUSES)[number];
  const returnTo = str(fd, "returnTo") || "/admin/bookings";
  if (!STATUSES.includes(status)) back(returnTo, "Invalid request");
  await bookingForUser(id, returnTo);

  try {
    await db.update(schema.bookings).set({ status }).where(eq(schema.bookings.id, id));
  } catch (e) {
    // Re-confirming a cancelled booking can collide with a newer booking
    if (String((e as { cause?: { code?: string } })?.cause?.code) === "23P01") back(returnTo, "That time is now taken by another booking.");
    throw e;
  }

  if (status === "CANCELLED" && fd.get("notify") === "on") {
    const b = await getBookingById(id);
    if (b) notifyCustomer("cancelled", b, await getBusiness()).catch(console.error);
  }
  revalidatePath("/admin", "layout");
  redirect(returnTo);
}

export async function createManualBooking(fd: FormData) {
  const user = await requireUser();
  const biz = await getBusiness();
  const date = str(fd, "date");
  const time = str(fd, "time");
  if (!isDateStr(date) || !/^\d{2}:\d{2}$/.test(time)) back("/admin/bookings/new", "Pick a valid date and time");

  // Barbers can only book onto their own calendar
  const staffId = can(user, "allBookings") ? str(fd, "staffId") : user.staffId;
  if (!staffId) back("/admin/bookings/new", "Your account isn't linked to a staff calendar. Ask the owner.");

  let token = "";
  try {
    const booking = await createBooking({
      serviceId: str(fd, "serviceId"),
      staffId: staffId!,
      startsAt: localToUtc(date, hhmmToMin(time), biz.timezone).toISOString(),
      customer: { name: str(fd, "name"), email: str(fd, "email") || null, phone: str(fd, "phone") || null },
      notes: str(fd, "notes") || null,
      source: "admin",
    });
    token = booking.manageToken;
    if (fd.get("notify") === "on") {
      const full = await getBookingById(booking.id);
      if (full) notifyCustomer("confirmed", full, biz).catch(console.error);
    }
  } catch (e) {
    if (e instanceof BookingError) back("/admin/bookings/new", e.code === "SLOT_TAKEN" ? "That staff member is already booked at that time." : e.message);
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/bookings?created=${token}`);
}

// =====================================================================
// Payments
// =====================================================================
export async function recordPayment(fd: FormData) {
  const id = str(fd, "id");
  const returnTo = str(fd, "returnTo") || `/admin/bookings/${id}`;
  const method = str(fd, "method");
  const amount = Number(fd.get("amount"));
  if (!(schema.PAYMENT_METHODS as readonly string[]).includes(method) || !(amount >= 0) || amount > 1_000_000) {
    back(returnTo, "Enter a valid amount and payment method");
  }
  const { booking: b } = await bookingForUser(id, returnTo);

  await db
    .update(schema.bookings)
    .set({
      paidCents: Math.round(amount * 100),
      paymentMethod: method,
      paidAt: new Date(),
      // Paying usually means the visit happened
      status: b.status === "CONFIRMED" && b.startsAt < new Date() ? "COMPLETED" : b.status,
    })
    .where(eq(schema.bookings.id, id));
  revalidatePath("/admin", "layout");
  redirect(returnTo);
}

export async function clearPayment(fd: FormData) {
  const id = str(fd, "id");
  const returnTo = str(fd, "returnTo") || `/admin/bookings/${id}`;
  await bookingForUser(id, returnTo);
  await db.update(schema.bookings).set({ paidCents: 0, paymentMethod: null, paidAt: null }).where(eq(schema.bookings.id, id));
  revalidatePath("/admin", "layout");
  redirect(returnTo);
}

// =====================================================================
// Expenses (finance)
// =====================================================================
export async function addExpense(fd: FormData) {
  await requirePerm("finance");
  const returnTo = str(fd, "returnTo") || "/admin/finance";
  const date = str(fd, "date");
  const category = str(fd, "category");
  const amount = Number(fd.get("amount"));
  if (!isDateStr(date) || !category || !(amount > 0) || amount > 10_000_000) back(returnTo, "Enter a date, category and amount for the expense");
  await db.insert(schema.expenses).values({
    date,
    category,
    description: str(fd, "description") || null,
    amountCents: Math.round(amount * 100),
  });
  revalidatePath("/admin/finance");
  redirect(returnTo);
}

export async function deleteExpense(fd: FormData) {
  await requirePerm("finance");
  const returnTo = str(fd, "returnTo") || "/admin/finance";
  await db.delete(schema.expenses).where(eq(schema.expenses.id, str(fd, "id")));
  revalidatePath("/admin/finance");
  redirect(returnTo);
}

// =====================================================================
// Services
// =====================================================================
export async function saveService(fd: FormData) {
  await requirePerm("services");
  const id = str(fd, "id");
  const values = {
    name: str(fd, "name"),
    description: str(fd, "description") || null,
    durationMin: int(fd, "durationMin"),
    bufferMin: int(fd, "bufferMin") || 0,
    priceCents: Math.round(Number(fd.get("price")) * 100),
  };
  if (!values.name || !(values.durationMin >= 5) || !(values.priceCents >= 0) || values.bufferMin < 0) {
    back("/admin/services", "Check the service name, duration and price");
  }
  if (id) await db.update(schema.services).set(values).where(eq(schema.services.id, id));
  else await db.insert(schema.services).values(values);
  revalidatePath("/", "layout");
  redirect("/admin/services");
}

export async function toggleService(fd: FormData) {
  await requirePerm("services");
  const id = str(fd, "id");
  const [s] = await db.select().from(schema.services).where(eq(schema.services.id, id));
  if (s) await db.update(schema.services).set({ active: !s.active }).where(eq(schema.services.id, id));
  revalidatePath("/", "layout");
  redirect("/admin/services");
}

// =====================================================================
// Staff, hours, time off
// =====================================================================
export async function addStaff(fd: FormData) {
  await requirePerm("staff");
  const name = str(fd, "name");
  if (!name) back("/admin/staff", "Enter a name");
  await db.insert(schema.staff).values({ name });
  revalidatePath("/", "layout");
  redirect("/admin/staff");
}

export async function toggleStaff(fd: FormData) {
  await requirePerm("staff");
  const id = str(fd, "id");
  const [s] = await db.select().from(schema.staff).where(eq(schema.staff.id, id));
  if (s) await db.update(schema.staff).set({ active: !s.active }).where(eq(schema.staff.id, id));
  revalidatePath("/", "layout");
  redirect("/admin/staff");
}

export async function addHours(fd: FormData) {
  await requirePerm("staff");
  const staffId = str(fd, "staffId");
  const start = hhmmToMin(str(fd, "start"));
  const end = hhmmToMin(str(fd, "end"));
  const days = fd.getAll("weekday").map(Number).filter((d) => d >= 0 && d <= 6);
  if (!uuidRe.test(staffId) || !days.length || !(end > start)) back("/admin/staff", "Pick at least one day and an end time after the start time");

  const existing = await db.select().from(schema.workingHours).where(eq(schema.workingHours.staffId, staffId));
  const clash = days.some((d) => existing.some((h) => h.weekday === d && start < h.endMin && end > h.startMin));
  if (clash) back("/admin/staff", "Those hours overlap hours that already exist for that day");

  await db.insert(schema.workingHours).values(days.map((weekday) => ({ staffId, weekday, startMin: start, endMin: end })));
  redirect("/admin/staff");
}

export async function deleteHours(fd: FormData) {
  await requirePerm("staff");
  await db.delete(schema.workingHours).where(eq(schema.workingHours.id, str(fd, "id")));
  redirect("/admin/staff");
}

/** Managers add time off for anyone; barbers only for themselves. */
export async function addTimeOff(fd: FormData) {
  const user = await requireUser();
  const biz = await getBusiness();
  const staffId = str(fd, "staffId");
  if (!can(user, "staff") && staffId !== user.staffId) back("/admin/staff", "You can only add time off for yourself");
  const from = str(fd, "from");
  const to = str(fd, "to") || from;
  if (!uuidRe.test(staffId) || !isDateStr(from) || !isDateStr(to) || to < from) back("/admin/staff", "Pick valid dates for time off");
  const startsAt = localToUtc(from, 0, biz.timezone);
  const endsAt = localToUtc(to, 24 * 60 - 1, biz.timezone); // end of the last day
  await db.insert(schema.timeOff).values({ staffId, startsAt, endsAt, reason: str(fd, "reason") || null });
  redirect("/admin/staff");
}

export async function deleteTimeOff(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const [row] = await db.select().from(schema.timeOff).where(eq(schema.timeOff.id, id));
  if (!row) redirect("/admin/staff");
  if (!can(user, "staff") && row!.staffId !== user.staffId) back("/admin/staff", "You can only remove your own time off");
  await db.delete(schema.timeOff).where(eq(schema.timeOff.id, id));
  redirect("/admin/staff");
}

// =====================================================================
// Business settings
// =====================================================================
export async function saveSettings(fd: FormData) {
  await requirePerm("settings");
  const biz = await getBusiness();
  await db
    .update(schema.business)
    .set({
      name: str(fd, "name") || biz.name,
      phone: str(fd, "phone") || null,
      address: str(fd, "address") || null,
      minNoticeMin: Math.max(0, int(fd, "minNoticeMin") || 0),
      maxDaysAhead: Math.min(365, Math.max(1, int(fd, "maxDaysAhead") || 30)),
      slotStepMin: [5, 10, 15, 20, 30, 60].includes(int(fd, "slotStepMin")) ? int(fd, "slotStepMin") : 15,
    })
    .where(eq(schema.business.id, biz.id));
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}
