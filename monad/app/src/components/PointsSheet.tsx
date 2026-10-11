"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetHead, ago } from "./ui";
import { query } from "@/lib/indexer";
import { EARN, foundingFans, points, reasonLabel } from "@/lib/terracePoints";

type Line = { id: string; reason: string; amount: string; multiplier: number; timestamp: string };

/** How Terrace Points work, plus your latest points. */
export function PointsSheet({ address, total, onClose }: { address?: string | null; total?: string | number; onClose: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  useEffect(() => {
    if (!address) return setLines([]);
    query<{ PointsEvent: Line[] }>(
      `query P($me: String!) { PointsEvent(where: { player: { _eq: $me } }, order_by: { timestamp: desc }, limit: 12) { id reason amount multiplier timestamp } }`,
      { me: address.toLowerCase() },
    ).then((d) => setLines(d.PointsEvent)).catch(() => setLines([]));
  }, [address]);
  const double = foundingFans();

  return (
    <Sheet onClose={onClose}>
      <SheetHead eyebrow="Rewards for playing" title={<>Terrace Points{total !== undefined && <> · <span className="amber">{points(total)}</span></>}</>} onClose={onClose} />
      {double && (
        <div className="card greenish" style={{ marginTop: 14, padding: 12 }}>
          <div className="uname">Founding fans earn double</div>
          <div className="umeta">Everything you do before 1 November counts twice. Early fans get remembered.</div>
        </div>
      )}
      {lines && lines.length > 0 && (
        <>
          <div className="flabel" style={{ marginTop: 18 }}>Your latest</div>
          <div className="card" style={{ padding: "2px 14px" }}>
            {lines.map((l) => (
              <div key={l.id} className="kv">
                <span className="k">{reasonLabel(l.reason)} <span className="umeta">· {ago(l.timestamp)}</span></span>
                <span className="v amber">+{points(l.amount)}{l.multiplier > 1 && <small className="umeta"> (2×)</small>}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flabel" style={{ marginTop: 18 }}>How to earn</div>
      <div className="card" style={{ padding: "2px 14px" }}>
        {EARN.map((e) => (
          <div key={e.reason} className="kv">
            <span className="k">
              {e.label}
              {e.note && <span className="umeta" style={{ display: "block", marginTop: 1 }}>{e.note}</span>}
            </span>
            <span className="v amber">+{e.points}{double && <small className="umeta"> ×2</small>}</span>
          </div>
        ))}
      </div>
      <p className="umeta" style={{ marginTop: 12, textAlign: "center" }}>
        Points are counted from what you do on Terrace, so every point is traceable. AI players don&apos;t earn them. No cash value.
      </p>
    </Sheet>
  );
}
