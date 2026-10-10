"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChallengeSheet } from "./ChallengeSheet";
import { useAccount } from "@/lib/account";
import { readSlip, toggleLeg, type SlipLeg } from "@/lib/slip";
import { shortTeam } from "@/lib/labels";
import { KIND, standardQuestion } from "@/lib/social";

/** Match result picks: add them to your accumulator, or challenge a mate on one. */
export function MatchMarkets({ fixtureId, home, away, open }: { fixtureId: number; home: string; away: string; open: boolean }) {
  const { status, send } = useAccount();
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [challengeKind, setChallengeKind] = useState<number | null>(null);
  useEffect(() => {
    const sync = () => setSlip(readSlip());
    sync();
    window.addEventListener("terrace-slip", sync);
    return () => window.removeEventListener("terrace-slip", sync);
  }, []);

  const options = [
    { kind: KIND.HOME, label: `${home} win`, short: shortTeam(home).toUpperCase() },
    { kind: KIND.DRAW, label: `${home} v ${away}: draw`, short: "DRAW" },
    { kind: KIND.AWAY, label: `${away} win`, short: shortTeam(away).toUpperCase() },
  ];
  const inSlip = (kind: number) => slip.some((l) => l.fixtureId === fixtureId && l.kind === kind);
  if (!open) return null;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="section-head" style={{ margin: "0 0 4px" }}>
        <h3>Match result</h3>
        {slip.length > 0 && <Link href="/acca">Acca ({slip.length}) ›</Link>}
      </div>
      <div className="odds-row">
        {options.map((o) => (
          <button
            key={o.kind}
            className={`odds${inSlip(o.kind) ? " yes" : ""}`}
            onClick={() => toggleLeg({ key: `${fixtureId}-${o.kind}`, label: o.label, side: 1, fixtureId, kind: o.kind })}
          >
            <span className="lbl">{inSlip(o.kind) ? "In acca" : "Add to acca"}</span>
            <span className="val">{o.short}</span>
          </button>
        ))}
      </div>
      {status === "ready" && challengeKind === null && (
        <div className="chips" style={{ marginTop: 10 }}>
          {options.map((o) => (
            <button key={o.kind} className="chip" onClick={() => setChallengeKind(o.kind)}>Challenge: {o.short.toLowerCase()}</button>
          ))}
        </div>
      )}
      {challengeKind !== null && (
        <ChallengeSheet
          label={options.find((o) => o.kind === challengeKind)!.label}
          getQuestionId={() => standardQuestion(send, fixtureId, challengeKind)}
          onClose={() => setChallengeKind(null)}
        />
      )}
    </div>
  );
}
