"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { points, reasonLabel } from "@/lib/terracePoints";
import { play } from "@/lib/sound";
import "@/styles/outcome.css";

/** "+20 Terrace Points · A bet comes in": a small toast whenever you earn points. */
export function PointsToast() {
  const { status, address } = useAccount();
  const [toast, setToast] = useState<{ amount: number; label: string; key: number } | null>(null);
  const since = useRef<number | null>(null);

  const check = useCallback(async () => {
    if (!address) return;
    try {
      const d = await query<{ PointsEvent: { reason: string; amount: string; timestamp: string }[] }>(
        `query T($me: String!) { PointsEvent(where: { player: { _eq: $me } }, order_by: { timestamp: desc }, limit: 10) { reason amount timestamp } }`,
        { me: address.toLowerCase() },
      );
      const latest = d.PointsEvent[0] ? Number(d.PointsEvent[0].timestamp) : 0;
      if (since.current === null) {
        since.current = latest; // only celebrate points earned from now on
        return;
      }
      const fresh = d.PointsEvent.filter((e) => Number(e.timestamp) > since.current!);
      if (!fresh.length) return;
      since.current = latest;
      const main = [...fresh].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
      setToast({ amount: fresh.reduce((s, e) => s + Number(e.amount), 0), label: reasonLabel(main.reason) + (fresh.length > 1 ? " and more" : ""), key: Date.now() });
    } catch {}
  }, [address]);

  useEffect(() => {
    if (status !== "ready") return;
    since.current = null;
    check();
    const t = setInterval(() => document.visibilityState === "visible" && check(), 15_000);
    const soon = () => setTimeout(check, 4000); // the indexer needs a moment after a transaction
    window.addEventListener("terrace-balance", soon);
    return () => {
      clearInterval(t);
      window.removeEventListener("terrace-balance", soon);
    };
  }, [status, check]);

  useEffect(() => {
    if (!toast) return;
    play("points");
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="points-toast" key={toast.key} role="status">
      <b>+{points(toast.amount)}</b> Terrace Points <span>· {toast.label}</span>
    </div>
  );
}
