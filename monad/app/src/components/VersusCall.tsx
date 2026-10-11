"use client";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Crest, Empty, Sheet, SheetHead } from "./ui";
import type { SidePrices } from "./VersusForm";
import { fractional } from "@/lib/odds";
import { KIND } from "@/lib/social";
import { useOpeningLines, type OpeningLine } from "@/lib/useOdds";
import type { MatchLite } from "@/lib/useMatches";

/** A standard question on a match that a 1v1 can be about. */
export type Call = { fixtureId: number; kind: number };

const KINDS = [KIND.HOME, KIND.DRAW, KIND.AWAY, KIND.OVER, KIND.BTTS];
const MARKET = (k: number) => (k === KIND.OVER ? "Goals" : k === KIND.BTTS ? "Both teams to score" : "Match result");

export function callLabel(m: MatchLite, kind: number) {
  if (kind === KIND.HOME) return `${m.home.name} to win`;
  if (kind === KIND.AWAY) return `${m.away.name} to win`;
  if (kind === KIND.DRAW) return `${m.home.name} v ${m.away.name} to be a draw`;
  if (kind === KIND.OVER) return `Over 2.5 goals in ${m.home.name} v ${m.away.name}`;
  return `Both teams to score in ${m.home.name} v ${m.away.name}`;
}

/** Bookmakers' line as a guide to each side (a 1v1 itself is even money: winner takes both stakes). */
export function guidePrices(line: OpeningLine | undefined, kind: number): SidePrices | null {
  if (!line) return null;
  const pair = (yes?: number, no?: number) => {
    if (!yes) return null;
    const n = no ?? 1 / (1 - 1 / yes);
    return { yes: fractional(yes), no: fractional(n) };
  };
  if (kind === KIND.HOME) return pair(line.home);
  if (kind === KIND.DRAW) return pair(line.draw);
  if (kind === KIND.AWAY) return pair(line.away);
  if (kind === KIND.OVER) return pair(line.over25, line.under25);
  return pair(line.bttsYes, line.bttsNo);
}

export const upcoming = (matches: Map<number, MatchLite>, now = Date.now() / 1000) =>
  [...matches.values()].filter((m) => (m.status === "NS" || m.status === "TBD") && m.kickoff > now).sort((a, b) => a.kickoff - b.kickoff);

const when = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** "The call" row: crest pair + the question; opens a sheet of upcoming matches and their calls. */
export function CallPicker({ matches, value, onChange }: { matches: Map<number, MatchLite>; value: Call | null; onChange: (c: Call) => void }) {
  const [open, setOpen] = useState(false);
  const lines = useOpeningLines();
  const list = useMemo(() => upcoming(matches), [matches]);
  const m = value ? matches.get(value.fixtureId) : undefined;

  return (
    <>
      <div className="flabel">The call</div>
      <button type="button" className="field row call-row" onClick={() => setOpen(true)}>
        {m ? (
          <span className="crest-pair"><Crest logo={m.home.logo} name={m.home.name} /><Crest logo={m.away.logo} name={m.away.name} /></span>
        ) : (
          <span className="crest"><Icon name="ball" size={18} /></span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="uname" style={{ display: "block" }}>{m && value ? callLabel(m, value.kind) : "Pick a match and a call"}</span>
          <span className="umeta" style={{ display: "block" }}>{m ? `${m.league ?? "Football"} · ${when(m.kickoff)}` : `${list.length} matches open`}</span>
        </span>
        <Icon name="chevronRight" size={16} />
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <SheetHead title="Pick the call" onClose={() => setOpen(false)} />
          {list.length === 0 ? (
            <Empty title="No open matches right now">Challenges open again when the next fixtures are scheduled.</Empty>
          ) : (
            <div style={{ marginTop: 14 }}>
              {list.map((f) => (
                <div key={f.id} className="card call-fixture" style={{ padding: "10px 14px 4px" }}>
                  <div className="match-top">
                    <span className="crest-pair"><Crest logo={f.home.logo} name={f.home.name} /><Crest logo={f.away.logo} name={f.away.name} /></span>
                    <span className="uname">{f.home.name} v {f.away.name}</span>
                    <span className="match-lg" style={{ marginLeft: "auto" }}>{when(f.kickoff)}</span>
                  </div>
                  {KINDS.map((k) => {
                    const on = value?.fixtureId === f.id && value.kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`call-opt${on ? " on" : ""}`}
                        onClick={() => {
                          onChange({ fixtureId: f.id, kind: k });
                          setOpen(false);
                        }}
                      >
                        <span className="q">{callLabel(f, k).replace(` in ${f.home.name} v ${f.away.name}`, "").replace(`${f.home.name} v ${f.away.name} to be a draw`, "Draw")}<span className="umeta" style={{ display: "block", fontWeight: 500 }}>{MARKET(k)}</span></span>
                        <span className="p">{guidePrices(lines[f.id], k)?.yes ?? ""}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
