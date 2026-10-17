"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { NotificationsSheet, useNotifications } from "./Notifications";
import { PointsSheet } from "./PointsSheet";
import { StreakPill } from "./StreakSheet";
import { RollingNumber } from "./RollingNumber";
import { TerraceMark } from "./TerraceMark";
import { ThemeButton } from "./ThemeSwitch";
import { money } from "./ui";
import { useAccount } from "@/lib/account";
import { useBalance } from "@/lib/useBalance";
import { play } from "@/lib/sound";
import { usePoints } from "@/lib/usePoints";

/**
 * The 54px sticky header from the handoff: back button or logo or title, then actions and
 * the balance pill (opens Wallet & payouts on Profile). Every screen renders its own.
 */
export function Header({
  title, sub, brand, back, balance = true, search, bell, share, children,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  brand?: boolean;
  back?: string | true;
  balance?: boolean;
  search?: boolean;
  bell?: boolean;
  share?: () => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className={`hdr${brand ? "" : " hdr-titled"}${back ? " hdr-back" : ""}`}>
      {back && (
        <button
          className="iconbtn"
          aria-label="Back"
          onClick={() => (back === true || window.history.length > 1 ? router.back() : router.push(back))}
        >
          <Icon name="chevronLeft" />
        </button>
      )}
      {brand ? (
        <Link href="/" className="logo">
          <TerraceMark size={30} />
          <span className="logo-word">Terrace</span>
        </Link>
      ) : (
        <div className="hdr-text">
          <div className="hdr-title">{title}</div>
          {sub && <div className="hdr-sub">{sub}</div>}
        </div>
      )}
      <div className="hdr-act">
        {children}
        {search && <Link href="/markets" className="iconbtn" aria-label="Search markets"><Icon name="search" /></Link>}
        {share && <button className="iconbtn" aria-label="Share" onClick={share}><Icon name="share" /></button>}
        <ThemeButton />
        {bell && <Bell />}
        {!back && <StreakPill />}
        {balance && <PointsPill />}
        {balance && <BalancePill />}
      </div>
    </header>
  );
}

// Unread count already announced, shared by every screen's bell so changing page doesn't ping again.
let heard = -1;

function Bell() {
  const { status } = useAccount();
  const { notes, unread, markSeen, seenAt } = useNotifications();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  useEffect(() => {
    if (status !== "ready") return;
    if (heard >= 0 && unread > heard) play("notify");
    heard = unread;
  }, [unread, status]);
  if (status !== "ready") {
    return <Link href="/social" className="iconbtn" aria-label="What fans are doing"><Icon name="bell" /></Link>;
  }
  return (
    <>
      <button
        className="iconbtn"
        aria-label={unread ? `${unread} new notifications` : "Notifications"}
        onClick={() => {
          setLastSeen(seenAt); // highlight what was new when the panel opened
          setOpen(true);
          markSeen();
        }}
      >
        <Icon name="bell" />
        {unread > 0 && <span className="dot" />}
      </button>
      {open && <NotificationsSheet notes={notes} seenAt={lastSeen} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Terrace Points: the bolt charges while something is being locked in, then the total rolls up. */
function PointsPill() {
  const { status, address } = useAccount();
  const { total, charging } = usePoints();
  const [open, setOpen] = useState(false);
  if (status !== "ready") return null;
  return (
    <>
      <button className={`ptspill${charging ? " charging" : ""}`} aria-label={`${total ?? 0} Terrace Points`} onClick={() => setOpen(true)}>
        <Icon name="bolt" size={15} />
        {total === null ? <span className="ptspill-ph" /> : <RollingNumber value={total} />}
      </button>
      {open && <PointsSheet address={address} total={total ?? 0} onClose={() => setOpen(false)} />}
    </>
  );
}

function BalancePill() {
  const { status } = useAccount();
  const { balance } = useBalance();
  if (status !== "ready") {
    return (
      <Link href="/me" className="balpill">
        <Icon name="wallet" size={16} /> Sign in
      </Link>
    );
  }
  return (
    <Link href="/me?wallet=1" className="balpill" aria-label="Available balance in test dollars">
      <Icon name="wallet" size={16} /> {balance ? money(balance.usd) : "…"}
      <span className="testtag">TEST</span>
    </Link>
  );
}

/** Native share sheet, or copy the link when there isn't one. Returns true when copied. */
export async function shareLink(title: string, text: string, url = window.location.href) {
  if (navigator.share) {
    await navigator.share({ title, text, url }).catch(() => {});
    return false;
  }
  await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  return true;
}
