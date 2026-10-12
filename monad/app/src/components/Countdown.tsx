"use client";
import { useEffect, useState } from "react";

/** "2d 4h", "3h 12m 05s", "4m 09s": time left until `to` (unix seconds), ticking every second. */
export function useCountdown(to: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, to - now);
}

export function formatLeft(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${two(m)}m ${two(sec)}s`;
  return `${m}m ${two(sec)}s`;
}

export function Countdown({ to }: { to: number }) {
  const left = useCountdown(to);
  return <span className="countdown">{formatLeft(left)}</span>;
}
