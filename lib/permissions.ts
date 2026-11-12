/**
 * Who can do what. Change this table to adjust roles. Every page and
 * server action checks these, so hiding a menu link is never the only guard.
 */
export type Role = "OWNER" | "MANAGER" | "STAFF";

export type Permission =
  | "allBookings" // see/edit every staff member's bookings, calendar & customers
  | "finance" // finance page, expenses, CSV export
  | "services" // add/edit services and prices
  | "staff" // add staff, edit everyone's working hours & time off
  | "settings" // business settings
  | "team"; // create/edit user accounts

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ["allBookings", "finance", "services", "staff", "settings", "team"],
  MANAGER: ["allBookings", "finance", "services", "staff"],
  STAFF: [], // barbers/stylists: only their own bookings, calendar, clients and time off
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Barber / Stylist",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Everything, including settings and user accounts",
  MANAGER: "All bookings, customers, finance, services and staff hours. No settings or accounts.",
  STAFF: "Only their own appointments, calendar, clients, payments and time off",
};

export function can(user: { role: Role } | null | undefined, perm: Permission) {
  return !!user && ROLE_PERMISSIONS[user.role].includes(perm);
}

/** A staff-role user only touches bookings on their own calendar. */
export function canAccessBooking(user: { role: Role; staffId: string | null }, booking: { staffId: string }) {
  return can(user, "allBookings") || (!!user.staffId && booking.staffId === user.staffId);
}

/** Returns the staffId to filter by, or undefined for "everyone". */
export function scopeStaffId(user: { role: Role; staffId: string | null }): string | undefined {
  if (can(user, "allBookings")) return undefined;
  // An unlinked staff account sees nothing (this UUID matches no staff member)
  return user.staffId ?? "00000000-0000-0000-0000-000000000000";
}
