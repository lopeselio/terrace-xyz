"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

/* Tab bar from the handoff: Home, Markets, raised green Create, Social, Profile. */
const TABS: { href: string; icon: IconName; label: string; match: (p: string) => boolean }[] = [
  { href: "/", icon: "home", label: "Home", match: (p) => p === "/" },
  { href: "/markets", icon: "pitch", label: "Markets", match: (p) => /^\/(markets|matches|m\/|flash|swipe)/.test(p) },
  { href: "/take", icon: "plus", label: "Create", match: (p) => p.startsWith("/take") },
  { href: "/social", icon: "users", label: "Social", match: (p) => p.startsWith("/social") },
  { href: "/me", icon: "shield", label: "Profile", match: (p) => /^\/(me|leagues|l\/|challenges|c\/|acca)/.test(p) },
];

export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`tab${t.href === "/take" ? " tab-create" : ""}${t.match(path) ? " on" : ""}`}
          aria-current={t.match(path) ? "page" : undefined}
        >
          <span className="pill"><Icon name={t.icon} size={22} /></span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
