"use client";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { TerraceMark } from "./TerraceMark";
import { useAccount } from "@/lib/account";
import "@/styles/onboarding.css";

const FLAG = "terrace.onboarded";

const VALUE: [IconName, string, string][] = [
  ["users", "Back your takes with your mates", "Say it in the chat, put money on it"],
  ["cards", "Swipe matchday calls", "Back or fade in one thumb"],
  ["bolt", "Play alongside AI pundits", "Copy them, fade them, beat them"],
];

/** The pitch, the value rows and the passkey buttons (screen-onboarding.html). */
export function OnboardingPanel({ compact, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { status, error, join, login } = useAccount();
  const busy = status === "signing-in";
  useEffect(() => {
    if (status === "ready") onDone?.();
  }, [status, onDone]);
  return (
    <div className={`onb${compact ? " compact" : ""}`}>
      <div className="onb-body">
        <div className="logo" style={{ gap: 12 }}>
          <TerraceMark size={44} />
          <span className="logo-word" style={{ fontSize: 30 }}>Terrace</span>
        </div>
        <div>
          <h1 className="onb-hero">Back your<br />take.</h1>
          <p className="onb-sub">Football calls with your mates. Real stakes, instant payouts, no bookmaker.</p>
        </div>
        <div className="rowlist">
          {VALUE.map(([icon, title, sub]) => (
            <div key={title} className="listrow">
              <span className="avatar" style={{ background: "var(--green-deep)", color: "var(--green)" }}><Icon name={icon} size={22} /></span>
              <div><div className="uname">{title}</div><div className="umeta">{sub}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <button className="cta" disabled={busy} onClick={() => join()}>
          {busy ? "Checking your passkey…" : "Get started"}
        </button>
        <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => login()}>
          I already have an account
        </button>
        <div className="umeta" style={{ textAlign: "center", marginTop: 10 }}>
          <Icon name="shield" size={12} /> Face ID or fingerprint. No passwords, nothing to install.
        </div>
        {error && <p className="error" style={{ textAlign: "center", marginTop: 8 }}>{error}</p>}
        {onDone && (
          <button className="textbtn onb-skip" onClick={onDone}>Look around first</button>
        )}
        <div className="umeta" style={{ textAlign: "center", marginTop: 12 }}>18+ · Please play responsibly</div>
      </div>
    </div>
  );
}

/** First-visit overlay. Visitors can skip it and play before signing in. Mount once, in the layout. */
export function Onboarding() {
  const { status } = useAccount();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem(FLAG) && localStorage.getItem("terrace.hasPasskey") !== "1");
    } catch {}
  }, []);
  if (!show || status === "ready") return null;
  const done = () => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div className="onb-overlay" role="dialog" aria-modal aria-label="Welcome to Terrace">
      <OnboardingPanel onDone={done} />
    </div>
  );
}
