"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { TerraceMark } from "./TerraceMark";
import { MonadMark } from "./MonadMark";
import { useAccount } from "@/lib/account";
import { OldPasskey } from "./OldPasskey";
import "@/styles/onboarding.css";

// v2: the intro now explains test money and points, so show it again to anyone who skipped the old one
const FLAG = "terrace.onboarded.v2";

type Row = [IconName, string, string];

const VALUE: Row[] = [
  ["users", "Back your takes with your mates", "Say it in the chat, back it with test dollars"],
  ["cards", "Swipe matchday calls", "Back or fade in one thumb"],
  ["bolt", "Play alongside AI pundits", "Copy them, fade them, beat them"],
];

const MONEY: Row[] = [
  ["wallet", "$100 in test dollars when you join", "Plus a little testnet USDC, all on us"],
  ["lock", "No real money during the preview", "You can't buy test dollars or cash them out"],
  ["check", "Everything else is real", "Real matches, real odds, settled by Chainlink on Monad"],
];

// mirrors indexer/src/points.ts
const POINTS: [IconName, string, string][] = [
  ["bolt", "Your first move", "+100"],
  ["flame", "Post a take in a match chat", "+5"],
  ["dollar", "Place a bet", "+10 and up"],
  ["trophy", "A bet comes in", "+20"],
  ["swords", "Send or accept a 1v1", "+15"],
  ["users", "Join a private league", "+25"],
  ["share", "Bring a new fan in", "+100"],
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="rowlist">
      {rows.map(([icon, title, sub]) => (
        <div key={title} className="listrow">
          <span className="avatar" style={{ background: "var(--green-deep)", color: "var(--green)" }}><Icon name={icon} size={22} /></span>
          <div><div className="uname">{title}</div><div className="umeta">{sub}</div></div>
        </div>
      ))}
    </div>
  );
}

function Logo() {
  return (
    <div className="logo" style={{ gap: 12 }}>
      <TerraceMark size={44} />
      <span className="logo-word" style={{ fontSize: 30 }}>Terrace</span>
    </div>
  );
}

/** Step 1: what Terrace is. */
function About() {
  return (
    <>
      <Logo />
      <div>
        <h1 className="onb-hero">Back your<br />take.</h1>
        <p className="onb-sub">Football calls with your mates, turned into markets they can back or fade. No bookmaker in the middle.</p>
      </div>
      <Rows rows={VALUE} />
    </>
  );
}

/** Step 2: it's all test money. */
function TestMoney() {
  return (
    <>
      <div className="onb-kicker"><MonadMark size={16} /> Preview on Monad testnet</div>
      <div>
        <h1 className="onb-hero">It&apos;s all<br /><span className="onb-hot">test money.</span></h1>
        <p className="onb-sub">Every dollar you see on Terrace is a test dollar. Play as hard as you like: nothing you do here costs you anything.</p>
      </div>
      <div className="onb-cash">
        <span className="badge b-flash">TEST DOLLARS</span>
        <span className="onb-cash-num">$100</span>
        <span className="umeta">waiting in your account</span>
      </div>
      <Rows rows={MONEY} />
    </>
  );
}

/** Step 3: Terrace Points. */
function Points() {
  return (
    <>
      <div className="onb-kicker amber"><Icon name="bolt" size={14} /> Terrace Points</div>
      <div>
        <h1 className="onb-hero">Play more.<br /><span className="onb-amber">Stack points.</span></h1>
        <p className="onb-sub">Points come from playing, not just winning. They build your record on the leaderboard. They aren&apos;t money.</p>
      </div>
      <div className="onb-pts">
        {POINTS.map(([icon, what, pts]) => (
          <div key={what} className="onb-pt">
            <Icon name={icon} size={16} />
            <span>{what}</span>
            <b>{pts}</b>
          </div>
        ))}
      </div>
      <div className="onb-founding"><Icon name="crown" size={14} /> Founding fans earn <b>2×</b> on everything until 1 Nov</div>
    </>
  );
}

/** The passkey buttons. Used as the intro's last step and on the signed-out Profile. */
export function OnboardingPanel({ compact, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { status, error, join, login } = useAccount();
  const busy = status === "signing-in";
  useEffect(() => {
    if (status === "ready") onDone?.();
  }, [status, onDone]);
  return (
    <div className={`onb${compact ? " compact" : ""}`}>
      <div className="onb-body">
        <Logo />
        <div>
          <h1 className="onb-hero">Back your<br />take.</h1>
          <p className="onb-sub">One Face ID and you&apos;re in, with $100 in test dollars to play. No real money.</p>
        </div>
      </div>
      <SignInButtons busy={busy} error={error} join={join} login={login} onDone={onDone} />
    </div>
  );
}

function SignInButtons({ busy, error, join, login, onDone }: { busy: boolean; error?: string | null; join: () => void; login: () => void; onDone?: () => void }) {
  return (
    <div>
      <button className="cta" disabled={busy} onClick={() => join()}>
        {busy ? "Checking your passkey…" : "Get started"}
      </button>
      <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => login()}>
        I already have an account
      </button>
      <OldPasskey />
      <div className="umeta" style={{ textAlign: "center", marginTop: 10 }}>
        <Icon name="shield" size={12} /> Face ID or fingerprint. No passwords, nothing to install.
      </div>
      {error && <p className="error" style={{ textAlign: "center", marginTop: 8 }}>{error}</p>}
      {onDone && (
        <button className="textbtn onb-skip" onClick={onDone}>Look around first</button>
      )}
      <div className="umeta" style={{ textAlign: "center", marginTop: 12 }}>Test money only · 18+ · Please play responsibly</div>
    </div>
  );
}

const STEPS = [About, TestMoney, Points];

/** First-visit intro: what Terrace is, test money, points, then sign in. Mount once, in the layout. */
export function Onboarding() {
  const { status, error, join, login } = useAccount();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem(FLAG) && localStorage.getItem("terrace.hasPasskey") !== "1");
    } catch {}
  }, []);
  useEffect(() => {
    if (status === "ready" && show) done();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show || status === "ready") return null;
  function done() {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {}
    setShow(false);
  }
  const last = step === STEPS.length;
  const go = (n: number) => setStep(Math.max(0, Math.min(STEPS.length, n)));
  const Body = STEPS[step];
  return (
    <div
      className="onb-overlay"
      role="dialog"
      aria-modal
      aria-label="Welcome to Terrace"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(step + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="onb">
        <div className="onb-top">
          <div className="onb-dots" aria-label={`Step ${step + 1} of ${STEPS.length + 1}`}>
            {[...STEPS, null].map((_, i) => (
              <button key={i} className={i === step ? "on" : i < step ? "done" : ""} onClick={() => go(i)} aria-label={`Step ${i + 1}`} />
            ))}
          </div>
          {!last && <button className="textbtn onb-skiptop" onClick={() => go(STEPS.length)}>Skip</button>}
        </div>
        <div className="onb-body" key={step}>
          {last ? (
            <>
              <Logo />
              <div>
                <h1 className="onb-hero">You&apos;re<br />ready.</h1>
                <p className="onb-sub">Create your account with a passkey. Your $100 in test dollars lands straight away.</p>
              </div>
            </>
          ) : (
            <Body />
          )}
        </div>
        {last ? (
          <SignInButtons busy={status === "signing-in"} error={error} join={join} login={login} onDone={done} />
        ) : (
          <div>
            <button className="cta" onClick={() => go(step + 1)}>{step === STEPS.length - 1 ? "Sign in" : "Next"}</button>
            {step > 0 && <button className="textbtn onb-skip" onClick={() => go(step - 1)}>Back</button>}
          </div>
        )}
      </div>
    </div>
  );
}
