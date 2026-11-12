import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------- Business settings (one row) ----------
export const business = pgTable("business", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  minNoticeMin: integer("min_notice_min").notNull().default(120), // can't book closer than this
  maxDaysAhead: integer("max_days_ahead").notNull().default(30),
  slotStepMin: integer("slot_step_min").notNull().default(15), // slot grid
});

// ---------- Services ----------
export const services = pgTable("services", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  durationMin: integer("duration_min").notNull(),
  bufferMin: integer("buffer_min").notNull().default(0), // cleanup time after
  priceCents: integer("price_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Staff + availability ----------
export const staff = pgTable("staff", {
  id: id(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const workingHours = pgTable(
  "working_hours",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = Sunday ... 6 = Saturday
    startMin: integer("start_min").notNull(), // minutes from midnight, 540 = 09:00
    endMin: integer("end_min").notNull(),
  },
  (t) => [index("wh_staff_weekday_idx").on(t.staffId, t.weekday)]
);

export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: text("reason"),
  },
  (t) => [index("timeoff_staff_idx").on(t.staffId, t.startsAt)]
);

// ---------- Customers ----------
export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("customers_email_idx").on(t.email), index("customers_phone_idx").on(t.phone)]
);

// ---------- Bookings ----------
export const bookingStatus = pgEnum("booking_status", [
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    startsAt: ts("starts_at").notNull(),
    // endsAt INCLUDES the service buffer, so cleanup time is protected too
    endsAt: ts("ends_at").notNull(),
    status: bookingStatus("status").notNull().default("CONFIRMED"),
    priceCents: integer("price_cents").notNull(),
    notes: text("notes"),
    source: text("source").notNull().default("online"), // "online" | "admin"
    manageToken: uuid("manage_token").notNull().unique().defaultRandom(),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    // ---- Payments ----
    paidCents: integer("paid_cents").notNull().default(0),
    paymentMethod: text("payment_method"), // "cash" | "card" | "eft" | "other"
    paidAt: ts("paid_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bookings_paid_at_idx").on(t.paidAt),
    index("bookings_staff_start_idx").on(t.staffId, t.startsAt),
    index("bookings_start_idx").on(t.startsAt),
  ]
  // NOTE: the "no_overlapping_bookings" exclusion constraint is added in a
  // custom SQL migration (see drizzle/0001_*.sql). It makes Postgres itself
  // reject double-bookings, even when two requests arrive at the same time.
);

// ---------- Expenses (rent, products, salaries, ...) ----------
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    date: text("date").notNull(), // "YYYY-MM-DD" in the business timezone
    category: text("category").notNull(),
    description: text("description"),
    amountCents: integer("amount_cents").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.date)]
);

export const PAYMENT_METHODS = ["cash", "card", "eft", "other"] as const;
export const EXPENSE_CATEGORIES = ["Rent", "Products & stock", "Salaries & commission", "Utilities", "Equipment", "Marketing", "Other"] as const;

// ---------- User accounts (owner, managers, barbers/stylists) ----------
export const userRole = pgEnum("user_role", ["OWNER", "MANAGER", "STAFF"]);

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(), // stored lower-case
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("STAFF"),
  // A barber/stylist account is linked to their staff record (their calendar)
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  // Bumping this logs the user out everywhere (password change, deactivation)
  sessionVersion: integer("session_version").notNull().default(1),
  lastLoginAt: ts("last_login_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Relations (for db.query.* with joins) ----------
export const staffRelations = relations(staff, ({ many }) => ({
  workingHours: many(workingHours),
  timeOff: many(timeOff),
  bookings: many(bookings),
}));
export const workingHoursRelations = relations(workingHours, ({ one }) => ({
  staff: one(staff, { fields: [workingHours.staffId], references: [staff.id] }),
}));
export const timeOffRelations = relations(timeOff, ({ one }) => ({
  staff: one(staff, { fields: [timeOff.staffId], references: [staff.id] }),
}));
export const servicesRelations = relations(services, ({ many }) => ({ bookings: many(bookings) }));
export const customersRelations = relations(customers, ({ many }) => ({ bookings: many(bookings) }));
export const bookingsRelations = relations(bookings, ({ one }) => ({
  service: one(services, { fields: [bookings.serviceId], references: [services.id] }),
  staff: one(staff, { fields: [bookings.staffId], references: [staff.id] }),
  customer: one(customers, { fields: [bookings.customerId], references: [customers.id] }),
}));

export type Booking = typeof bookings.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Business = typeof business.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Role = User["role"];
