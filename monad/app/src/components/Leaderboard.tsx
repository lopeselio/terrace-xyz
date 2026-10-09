"use client";

import type { Address } from "viem";
import { shortName } from "@/lib/terrace";

export function Leaderboard({ rows, me }: { rows: { player: Address; points: number }[]; me?: Address }) {
  if (rows.length === 0) return <p className="muted">No one's in yet. Send the link to your group chat.</p>;
  return (
    <ol className="board">
      {rows.map((r) => (
        <li key={r.player} className={me && r.player.toLowerCase() === me.toLowerCase() ? "me" : undefined}>
          <span>{shortName(r.player, me)}</span>
          <span className="pts">{r.points}</span>
        </li>
      ))}
    </ol>
  );
}
