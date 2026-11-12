"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

export default function AdminNav({
  name,
  links,
  user,
  logout,
}: {
  name: string;
  links: NavLink[];
  user: { name: string; role: string };
  logout: () => Promise<void>;
}) {
  const path = usePathname();
  return (
    <nav className="admin-nav">
      <Link href="/admin" className="brand">{name}</Link>
      {links.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>{l.label}</Link>
        );
      })}
      <Link href="/" target="_blank">🌐 View booking site</Link>
      <div className="nav-user">
        <Link href="/admin/account" className={path.startsWith("/admin/account") ? "active" : ""}>
          👤 {user.name}
          <span className="nav-role">{user.role}</span>
        </Link>
        <form action={logout}>
          <button className="btn secondary sm" style={{ marginLeft: 8 }}>Log out</button>
        </form>
      </div>
    </nav>
  );
}
