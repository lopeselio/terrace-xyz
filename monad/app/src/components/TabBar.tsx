"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

/* Bottom tab bar from the Solana app: 5 tabs, line icons in pills, a raised green centre action. */
const TABS: { href: string; icon: IconName; label: string; match: (p: string) => boolean }[] = [
  { href: "/", icon: "home", label: "Home", match: (p) => p === "/" },
  { href: "/matches", icon: "ball", label: "Matches", match: (p) => p.startsWith("/matches") || p.startsWith("/m/") },
  { href: "/take", icon: "plus", label: "Take", match: (p) => p.startsWith("/take") },
  { href: "/leagues", icon: "users", label: "Leagues", match: (p) => p.startsWith("/leagues") || p.startsWith("/l/") },
  { href: "/me", icon: "trophy", label: "Profile", match: (p) => p.startsWith("/me") },
];

export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) =>
        t.href === "/take" ? (
          <Link key={t.href} href={t.href} className="create">
            <span className="fab"><Icon name="plus" size={24} /></span>
            {t.label}
          </Link>
        ) : (
          <Link key={t.href} href={t.href} className={t.match(path) ? "on" : undefined}>
            <span className="pill"><Icon name={t.icon} size={22} /></span>
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
