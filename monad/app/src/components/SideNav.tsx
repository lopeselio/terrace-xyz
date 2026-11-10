"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { LayoutToggle } from "./LayoutSwitch";
import { TABS } from "./TabBar";
import { TerraceMark } from "./TerraceMark";
import { ThemeButton } from "./ThemeSwitch";

/* Desktop layout: the tab bar becomes a sidebar, with room for the screens the phone keeps under Profile. */
const MORE: { href: string; icon: IconName; label: string; match: (p: string) => boolean }[] = [
  { href: "/live", icon: "whistle", label: "Game day", match: (p) => p.startsWith("/live") },
  { href: "/leagues", icon: "trophy", label: "Leagues", match: (p) => /^\/(leagues|l\/)/.test(p) },
  { href: "/challenges", icon: "swords", label: "1v1 challenges", match: (p) => /^\/(challenges|c\/)/.test(p) },
  { href: "/acca", icon: "list", label: "Parlays", match: (p) => p.startsWith("/acca") },
  { href: "/swipe", icon: "cards", label: "Swipe", match: (p) => p.startsWith("/swipe") },
];

export function SideNav() {
  const path = usePathname() ?? "/";
  if (path.startsWith("/ops")) return null;
  const moreOn = MORE.some((m) => m.match(path));
  return (
    <nav className="sidenav" aria-label="Main">
      <Link href="/" className="logo sidenav-logo">
        <TerraceMark size={32} />
        <span className="logo-word">Terrace</span>
      </Link>
      {TABS.filter((t) => t.href !== "/take").map((t) => (
        <Link key={t.href} href={t.href} className={`side-link${t.match(path) && !(t.href === "/me" && moreOn) ? " on" : ""}`}>
          <Icon name={t.icon} size={21} /> {t.label}
        </Link>
      ))}
      <Link href="/take" className="side-create">
        <Icon name="plus" size={20} /> Make a take
      </Link>
      <div className="side-label">More</div>
      {MORE.map((m) => (
        <Link key={m.href} href={m.href} className={`side-link${m.match(path) ? " on" : ""}`}>
          <Icon name={m.icon} size={20} /> {m.label}
        </Link>
      ))}
      <div className="side-foot">
        <LayoutToggle />
        <ThemeButton />
      </div>
    </nav>
  );
}
