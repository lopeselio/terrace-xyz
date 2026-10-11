"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Feedback while something saves in the background: a thin animated bar under the header and a
 * "Locking it in…" pill, then a short "Done" tick. Driven by `terrace-busy` events from send().
 */
export function Activity() {
  const [busy, setBusy] = useState(0);
  const [done, setDone] = useState(false);
  const was = useRef(0);

  useEffect(() => {
    const on = (e: Event) => setBusy((n) => Math.max(0, n + (e as CustomEvent<number>).detail));
    window.addEventListener("terrace-busy", on);
    return () => window.removeEventListener("terrace-busy", on);
  }, []);

  useEffect(() => {
    if (was.current > 0 && busy === 0) {
      setDone(true);
      const t = setTimeout(() => setDone(false), 1400);
      was.current = busy;
      return () => clearTimeout(t);
    }
    if (busy > 0) setDone(false);
    was.current = busy;
  }, [busy]);

  if (!busy && !done) return null;
  return (
    <>
      {busy > 0 && <div className="busy-bar" aria-hidden><i /></div>}
      <div className={`busy-pill${done ? " done" : ""}`} role="status" aria-live="polite">
        {done ? <><Icon name="check" size={14} /> Done</> : <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Locking it in…</>}
      </div>
    </>
  );
}
