"use client";
import { useEffect, useRef, useState } from "react";

/*
 * A number that counts up like a clock when it changes: 40 → 45 ticks the last digit through
 * 1, 2, 3, 4, 5 in well under a second, and each digit that moves drops in from above.
 */
export function RollingNumber({ value, format = (n) => n.toLocaleString("en-US"), ms = 700 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const [moved, setMoved] = useState(false); // no drop-in on first paint, only when it changes

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      return setShown(value);
    }
    setMoved(true);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const n = Math.round(start + (value - start) * eased);
      from.current = n;
      setShown(n);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  const text = format(shown);
  return (
    <span className="roll" aria-label={format(value)}>
      {text.split("").map((c, i) => (
        // Keyed by place from the right, so only the digits that change replay their drop.
        <span key={`${text.length - i}-${c}`} className={moved && /\d/.test(c) ? "roll-d" : undefined} aria-hidden>{c}</span>
      ))}
    </span>
  );
}
