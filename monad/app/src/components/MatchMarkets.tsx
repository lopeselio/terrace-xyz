"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BetSheet } from "./BetSheet";
import { ChallengeSheet } from "./ChallengeSheet";
import { Icon } from "./Icon";
import { Badge, Odd, SectionHead } from "./ui";
import { useAccount } from "@/lib/account";
import { stdLabel, useMatchPrices } from "@/lib/picks";
import { readSlip, toggleLeg, type SlipLeg } from "@/lib/slip";
import { KIND, standardQuestion } from "@/lib/social";
import "@/styles/match.css";

type Teams = { id: number; home: { name: string }; away: { name: string } };
type Sel = { kind: number; side: 1 | 2 };

/** The yes/no question behind a standard market, for 1v1 challenges. */
const question = (m: Teams, kind: number) =>
  kind === KIND.HOME ? `${m.home.name} to win` : kind === KIND.AWAY ? `${m.away.name} to win` : kind === KIND.DRAW ? "A draw" : kind === KIND.OVER ? "Over 2.5 goals" : "Both teams to score";

/**
 * A match's standard markets (result, goals, both teams to score), sportsbook style: tap a price to
 * select it, the green slip bar opens the bet sheet. A selection can also go on the parlay slip or
 * become a 1v1 challenge. The oracle closes these at kick-off.
 */
export function MatchMarkets({ m, view, open }: { m: Teams; view: "result" | "goals"; open: boolean }) {
  const { address, send } = useAccount();
  const prices = useMatchPrices([m.id]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [betting, setBetting] = useState(false);
  const [challenging, setChallenging] = useState(false);
  const [slip, setSlip] = useState<SlipLeg[]>([]);

  useEffect(() => {
    const sync = () => setSlip(readSlip());
    sync();
    window.addEventListener("terrace-slip", sync);
    return () => window.removeEventListener("terrace-slip", sync);
  }, []);

  const isOn = (kind: number, side: 1 | 2) => sel?.kind === kind && sel.side === side;
  const choose = (kind: number, side: 1 | 2) => setSel(isOn(kind, side) ? null : { kind, side });
  const odd = (label: string, kind: number, side: 1 | 2, tone?: "yes" | "no") => (
    <Odd label={label} value={prices.odds(m.id, kind, side)} tone={tone} on={isOn(kind, side)} disabled={!open} onClick={() => choose(kind, side)} />
  );

  // Parlay legs resolve standard questions without a goal line, so over/under stays out of the slip.
  const parlayable = sel && sel.kind !== KIND.OVER && !(sel.kind <= KIND.AWAY && sel.side === 2);
  const legKey = sel ? `${m.id}-${sel.kind}-${sel.side}` : "";
  const inSlip = slip.some((l) => l.key === legKey);
  const selLabel = sel ? stdLabel(m, sel.kind, sel.side) : "";

  return (
    <>
      {view === "result" ? (
        <div className="sec">
          <SectionHead title="Full time result">
            <span style={{ marginLeft: "auto" }}><Badge tone="terrace">Terrace</Badge></span>
          </SectionHead>
          <div className="oddsrow">
            {odd(m.home.name, KIND.HOME, 1)}
            {odd("Draw", KIND.DRAW, 1)}
            {odd(m.away.name, KIND.AWAY, 1)}
          </div>
        </div>
      ) : (
        <>
          <div className="sec">
            <SectionHead title="Total goals · 2.5" />
            <div className="oddsrow two">
              {odd("Over 2.5", KIND.OVER, 1, "yes")}
              {odd("Under 2.5", KIND.OVER, 2, "no")}
            </div>
          </div>
          <div className="sec">
            <SectionHead title="Both teams to score" />
            <div className="oddsrow two">
              {odd("Yes", KIND.BTTS, 1, "yes")}
              {odd("No", KIND.BTTS, 2, "no")}
            </div>
          </div>
        </>
      )}

      <div className="sec">
        {open ? (
          <div className="umeta">
            Pool prices. Before anyone&apos;s on both sides we show the bookmakers&apos; opening line. Closes at kick-off, settled from the final score by Chainlink.
          </div>
        ) : (
          <div className="row umeta" style={{ gap: 6 }}>
            <Icon name="lock" size={14} /> Closed at kick-off. Back a take on this match instead.
          </div>
        )}
        {sel && open && (
          <div className="mm-actions">
            {parlayable && (
              <button
                className={`chip${inSlip ? " on" : ""}`}
                onClick={() => toggleLeg({ key: legKey, label: `${selLabel} (${m.home.name} v ${m.away.name})`, side: sel.side, fixtureId: m.id, kind: sel.kind })}
              >
                <Icon name="list" size={14} /> {inSlip ? "On your parlay" : "Add to parlay"}
              </button>
            )}
            {address && (
              <button className="chip" onClick={() => setChallenging(true)}>
                <Icon name="swords" size={14} /> Challenge a mate
              </button>
            )}
            {slip.length > 0 && (
              <Link href="/acca" className="chip">
                Parlay ({slip.length}) <Icon name="chevronRight" size={14} />
              </Link>
            )}
          </div>
        )}
      </div>

      {challenging && sel && (
        <ChallengeSheet
          label={`${question(m, sel.kind)} · ${m.home.name} v ${m.away.name}`}
          getQuestionId={() => standardQuestion(send, m.id, sel.kind, sel.kind === KIND.OVER ? 2 : 0)}
          onClose={() => setChallenging(false)}
        />
      )}

      {sel && open && !betting && (
        <button className="slipbar" onClick={() => setBetting(true)}>
          <span className="n">1</span>
          <b>{selLabel}</b>
          <span className="rt">
            {prices.odds(m.id, sel.kind, sel.side)} <Icon name="chevronRight" size={16} />
          </span>
        </button>
      )}
      {betting && sel && (
        <BetSheet pick={prices.pick(m, sel.kind, sel.side, send, address)} onClose={() => setBetting(false)} onPlaced={() => setSel(null)} />
      )}
    </>
  );
}
