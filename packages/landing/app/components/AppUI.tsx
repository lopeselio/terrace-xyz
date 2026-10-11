"use client";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/* The app's own building blocks (same classes as monad/app), recreated for the site's phone mockups. */

export const CREST = {
  LIV: "https://media.api-sports.io/football/teams/40.png",
  MCI: "https://media.api-sports.io/football/teams/50.png",
  ARS: "https://media.api-sports.io/football/teams/42.png",
  CHE: "https://media.api-sports.io/football/teams/49.png",
  RMA: "https://media.api-sports.io/football/teams/541.png",
  BAR: "https://media.api-sports.io/football/teams/529.png",
  ATA: "https://media.api-sports.io/football/teams/499.png",
  INT: "https://media.api-sports.io/football/teams/505.png",
};

export function Crest({ code, lg }: { code: keyof typeof CREST; lg?: boolean }) {
  return (
    <span className={`crest${lg ? " crest-lg" : ""}`}>
      <img src={CREST[code]} alt="" loading="lazy" />
    </span>
  );
}

const AV = ["#1d4ed8", "#7c2d12", "#166534", "#4c1d95", "#831843", "#0e7490"];
export function Avatar({ name, i = 0, size = 38 }: { name: string; i?: number; size?: number }) {
  const mono = name.split(/[\s.]+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: AV[i % AV.length] }}>
      {mono}
    </span>
  );
}

export function Odd({ label, value, tone, on }: { label?: string; value: ReactNode; tone?: "yes" | "no"; on?: boolean }) {
  return (
    <span className={`odd${tone === "yes" ? " odd-yes" : tone === "no" ? " odd-no no" : ""}${on ? " on" : ""}`}>
      {label && <span className="lbl">{label}</span>}
      <span className="val">{value}</span>
    </span>
  );
}

export function Badge({ cls, icon, mark, children }: { cls: string; icon?: IconName; mark?: "chainlink"; children: ReactNode }) {
  return (
    <span className={`badge ${cls}`}>
      {cls === "b-live" && <i className="livedot" />}
      {mark === "chainlink" && <img className="mark" src="/chainlink.png" alt="" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export const AIBadge = () => <span className="badge b-private">AI</span>;

/** A phone with the app's status bar, optional header and tab bar. Content is the real 390px layout, scaled. */
export function Phone({
  children, header, tab, overlay, className,
}: { children: ReactNode; header?: ReactNode; tab?: "home" | "markets" | "create" | "social" | "profile" | null; overlay?: ReactNode; className?: string }) {
  return (
    <div className={`phone-wrap ${className ?? ""}`}>
      <div className="phone" aria-hidden>
        <div className="statusbar">
          <span>9:41</span>
          <span className="sbr"><Icon name="chart" size={13} /> <Icon name="bell" size={13} /> <b>100%</b></span>
        </div>
        {header}
        <div className="screen">{children}</div>
        {tab !== null && <TabBar active={tab ?? "home"} />}
        {overlay}
      </div>
    </div>
  );
}

export function Header({ title, sub, brand, back, balance = "$14.22" }: { title?: string; sub?: string; brand?: boolean; back?: boolean; balance?: string | null }) {
  return (
    <div className="hdr">
      {back && <span className="iconbtn"><Icon name="chevronLeft" /></span>}
      {brand ? (
        <span className="logo"><img src="/terrace.png" alt="" width={30} height={30} style={{ borderRadius: 9 }} /><span className="logo-word">Terrace</span></span>
      ) : (
        <div><div className="hdr-title">{title}</div>{sub && <div className="hdr-sub">{sub}</div>}</div>
      )}
      <div className="hdr-act">
        {brand && <span className="iconbtn"><Icon name="bell" /><span className="dot" /></span>}
        {balance && <span className="balpill"><Icon name="wallet" size={16} /> {balance}</span>}
      </div>
    </div>
  );
}

function TabBar({ active }: { active: string }) {
  const tabs: [string, string, IconName][] = [["home", "Home", "home"], ["markets", "Markets", "pitch"], ["create", "Create", "plus"], ["social", "Social", "users"], ["profile", "Profile", "shield"]];
  return (
    <div className="tabbar">
      {tabs.map(([id, label, icon]) => (
        <span key={id} className={`tab${id === "create" ? " tab-create" : ""}${active === id ? " on" : ""}`}>
          <span className="pill"><Icon name={icon} size={22} /></span>
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Steps through a scene's states while it's on screen. Reduced motion: holds on the last (complete) state. */
export function useScene(steps: number, ms = 2200) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) return setStep(steps - 1);
    if (!inView) return;
    const t = setInterval(() => setStep((s) => (s + 1) % steps), ms);
    return () => clearInterval(t);
  }, [inView, reduce, steps, ms]);
  return { ref, step };
}

/** A number that counts up when it changes. */
export function Count({ to, prefix = "", decimals = 0 }: { to: number; prefix?: string; decimals?: number }) {
  const [v, setV] = useState(to);
  const prev = useRef(to);
  useEffect(() => {
    const c = animate(prev.current, to, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    prev.current = to;
    return () => c.stop();
  }, [to]);
  return <>{prefix}{v.toFixed(decimals)}</>;
}

/** Types a sentence out, once per mount. */
export function Typed({ text, speed = 38, run }: { text: string; speed?: number; run: boolean }) {
  const [n, setN] = useState(run ? 0 : text.length);
  useEffect(() => {
    if (!run) return setN(text.length);
    setN(0);
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 1)), speed);
    return () => clearInterval(t);
  }, [text, speed, run]);
  return <>{text.slice(0, n)}{run && n < text.length && <span className="caret" />}</>;
}
