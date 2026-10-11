"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { TerraceMark } from "./TerraceMark";
import { money } from "./ui";
import { useAccount } from "@/lib/account";
import { useBalance } from "@/lib/useBalance";

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
    <header className="hdr">
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
        <div style={{ minWidth: 0 }}>
          <div className="hdr-title">{title}</div>
          {sub && <div className="hdr-sub">{sub}</div>}
        </div>
      )}
      <div className="hdr-act">
        {children}
        {search && <Link href="/markets" className="iconbtn" aria-label="Search markets"><Icon name="search" /></Link>}
        {share && <button className="iconbtn" aria-label="Share" onClick={share}><Icon name="share" /></button>}
        {bell && <Link href="/social" className="iconbtn" aria-label="What your mates are doing"><Icon name="bell" /><span className="dot" /></Link>}
        {balance && <BalancePill />}
      </div>
    </header>
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
    <Link href="/me?wallet=1" className="balpill" aria-label="Available balance">
      <Icon name="wallet" size={16} /> {balance ? money(balance.usd) : "…"}
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
