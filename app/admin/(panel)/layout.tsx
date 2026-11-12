import AdminNav, { type NavLink } from "@/components/AdminNav";
import { requireUser } from "@/lib/auth";
import { getBusiness } from "@/lib/booking";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const biz = await getBusiness();
  const mine = !can(user, "allBookings");

  // Only show what this role may open (every page also checks on the server)
  const links: NavLink[] = [
    { href: "/admin", label: mine ? "📊 My day" : "📊 Dashboard" },
    { href: "/admin/calendar", label: mine ? "📅 My calendar" : "📅 Calendar" },
    { href: "/admin/bookings", label: mine ? "📋 My bookings" : "📋 Bookings" },
    { href: "/admin/customers", label: mine ? "👥 My clients" : "👥 Customers" },
    ...(can(user, "finance") ? [{ href: "/admin/finance", label: "💰 Finance" }] : []),
    ...(can(user, "services") ? [{ href: "/admin/services", label: "✂️ Services" }] : []),
    { href: "/admin/staff", label: can(user, "staff") ? "🕘 Staff & hours" : "🕘 My hours & time off" },
    ...(can(user, "team") ? [{ href: "/admin/team", label: "🔑 Team accounts" }] : []),
    ...(can(user, "settings") ? [{ href: "/admin/settings", label: "⚙️ Settings" }] : []),
  ];

  return (
    <div className="admin">
      <AdminNav name={biz.name} links={links} user={{ name: user.name, role: ROLE_LABEL[user.role] }} logout={logout} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
