"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { STOPPAGES, type StoppageAction, type StoppageCode } from "@/lib/errors";
import "@/styles/outcome.css";

/*
 * The stoppage popup: when Terrace AI, the match data or the connection lets a fan down, say so in
 * football terms and offer what they can still do. Raised with callStoppage() from lib/errors.ts.
 * Soft codes (background hiccups) show as a short toast instead, at most once every five minutes.
 */
type Raised = { code: StoppageCode; primary?: StoppageAction; secondary?: StoppageAction };

const SOFT_EVERY_MS = 5 * 60_000;

export function StoppagePopup() {
  const [now, setNow] = useState<Raised | null>(null);
  const [toast, setToast] = useState<StoppageCode | null>(null);
  const lastSoft = useRef(0);

  useEffect(() => {
    const on = (e: Event) => {
      const raised = (e as CustomEvent<Raised>).detail;
      if (!STOPPAGES[raised.code]?.soft) return setNow(raised);
      if (Date.now() - lastSoft.current < SOFT_EVERY_MS) return;
      lastSoft.current = Date.now();
      setToast(raised.code);
    };
    window.addEventListener("terrace-stoppage", on);
    return () => window.removeEventListener("terrace-stoppage", on);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!now) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setNow(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [now]);

  const soft = toast && (
    <div className="stoppage-toast" role="status" aria-live="polite">
      <Icon name={STOPPAGES[toast].icon} size={15} /> <b>{STOPPAGES[toast].title}</b> <span>{STOPPAGES[toast].body}</span>
    </div>
  );
  if (!now) return soft || null;

  const s = STOPPAGES[now.code] ?? STOPPAGES.server;
  const run = (a?: StoppageAction) => {
    setNow(null);
    a?.run?.();
  };

  return (
    <>
      {soft}
      <div className="outcome stoppage" role="alertdialog" aria-modal aria-labelledby="stoppage-head" aria-describedby="stoppage-body">
        <div className="outcome-scrim" onClick={() => run()} />
        <div className="outcome-card">
          <div className="outcome-icon"><Icon name={s.icon} size={28} /></div>
          <div className="gw-eyebrow">Stoppage</div>
          <div className="outcome-head" id="stoppage-head">{s.title}</div>
          <p className="outcome-sub" id="stoppage-body">{s.body}</p>
          <div className="outcome-actions">
            <button className="cta" onClick={() => run(now.primary)} autoFocus>{now.primary?.label ?? "Got it"}</button>
            {now.secondary && <button className="cta cta-ghost cta-sm" onClick={() => run(now.secondary)}>{now.secondary.label}</button>}
          </div>
        </div>
      </div>
    </>
  );
}
