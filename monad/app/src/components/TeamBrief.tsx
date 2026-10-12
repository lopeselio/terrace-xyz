"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { TeamPicker } from "./TeamPicker";
import { Odd } from "./ui";
import { useAccount } from "@/lib/account";
import { useFavTeam } from "@/lib/favTeam";
import { fractional } from "@/lib/odds";
import { KIND } from "@/lib/social";

/*
 * "Your club": an FPL-style matchday brief for the fan's team: next match and the bookmakers'
 * prices, a prediction, form, league position and head-to-head, with one tap to back them.
 */

type Side = { id: number; name: string; logo: string };
type Pos = { rank: number; points: number; played: number; of: number } | null;
type Brief = {
  next: { id: number; kickoff: number; venue: string | null; league: { id: number; name: string; logo: string }; home: Side; away: Side; isHome: boolean; onTerrace: boolean } | null;
  odds: { home?: number; draw?: number; away?: number } | null;
  prediction: {
    advice: string;
    percent: { home: string; draw: string; away: string };
    form: { home: string; away: string };
    comparison: Record<string, { home: string; away: string }>;
    h2h: { date: string; home: string; away: string; score: string }[];
  } | null;
  table: { home: Pos; away: Pos };
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TeamBrief({ odds, onPick }: { odds: (fixtureId: number, kind: number) => string; onPick: (m: { id: number; home: { name: string }; away: { name: string } }, kind: number) => void }) {
  const { team, ready } = useFavTeam();
  const [picking, setPicking] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [failed, setFailed] = useState(false);
  const { status } = useAccount();

  // Right after a fan's first sign-in, ask once who they support.
  useEffect(() => {
    if (!ready || team || status !== "ready") return;
    try {
      if (localStorage.getItem("terrace.teamAsked")) return;
      localStorage.setItem("terrace.teamAsked", "1");
    } catch {
      return;
    }
    setPicking(true);
  }, [ready, team, status]);

  useEffect(() => {
    if (!team) return setBrief(null);
    setFailed(false);
    setBrief(null);
    fetch(`/api/team-brief?team=${team.id}`)
      .then((r) => r.json())
      .then((b: Brief & { error?: string }) => (b.error ? setFailed(true) : setBrief(b)))
      .catch(() => setFailed(true));
  }, [team]);

  if (!ready) return null;
  if (!team) {
    return (
      <div className="sec">
        <button className="card brief-pick" onClick={() => setPicking(true)}>
          <span className="brief-pick-icon"><Icon name="shield" size={22} /></span>
          <span style={{ flex: 1, textAlign: "left" }}>
            <span className="uname" style={{ display: "block" }}>Who do you support?</span>
            <span className="umeta">Pick your club for a matchday brief: next game, odds, form and predictions.</span>
          </span>
          <Icon name="chevronRight" size={16} />
        </button>
        {picking && <TeamPicker onClose={() => setPicking(false)} />}
      </div>
    );
  }

  const n = brief?.next;
  const p = brief?.prediction;
  const us = n ? (n.isHome ? n.home : n.away) : null;
  const them = n ? (n.isHome ? n.away : n.home) : null;
  const ourPos = n ? (n.isHome ? brief?.table.home : brief?.table.away) : null;
  const pct = (s?: string) => Number((s ?? "0").replace("%", ""));
  const kindFor = (side: "home" | "draw" | "away") => (side === "home" ? KIND.HOME : side === "draw" ? KIND.DRAW : KIND.AWAY);
  const priceOf = (side: "home" | "draw" | "away") => (n?.onTerrace ? odds(n.id, kindFor(side)) : fractional(brief?.odds?.[side]));

  return (
    <div className="sec">
      <div className="sec-hd">
        <h3>Your club</h3>
        <button className="more" onClick={() => setPicking(true)}>Change <Icon name="chevronRight" size={14} /></button>
      </div>
      <div className="card brief">
        <div className="row">
          <img src={team.logo} alt="" width={40} height={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cond" style={{ fontSize: 20, textTransform: "uppercase", letterSpacing: 0.3 }}>{team.name}</div>
            <div className="umeta">
              {ourPos ? `${ordinal(ourPos.rank)} of ${ourPos.of} · ${ourPos.points} pts from ${ourPos.played}` : team.league}
            </div>
          </div>
          {p && <FormPills form={n?.isHome ? p.form.home : p.form.away} />}
        </div>

        {failed && <div className="umeta" style={{ marginTop: 12 }}>Couldn&apos;t load the brief right now.</div>}
        {!brief && !failed && <div className="sk" style={{ height: 120, marginTop: 12 }} />}
        {brief && !n && <div className="umeta" style={{ marginTop: 12 }}>No upcoming match found for {team.name}.</div>}

        {n && us && them && (
          <>
            <div className="brief-next">
              <div className="row" style={{ gap: 6 }}>
                <span className="league-tile" style={{ width: 20, height: 20 }}><img src={n.league.logo} alt="" width={16} height={16} /></span>
                <span className="eyebrow">Next · {when(n.kickoff)}</span>
              </div>
              <div className="brief-teams">
                <span><img src={n.home.logo} alt="" width={36} height={36} />{n.home.name}</span>
                <b>v</b>
                <span><img src={n.away.logo} alt="" width={36} height={36} />{n.away.name}</span>
              </div>
              {n.venue && <div className="umeta" style={{ textAlign: "center" }}>{n.venue}</div>}
            </div>

            <div className="oddsrow" style={{ marginTop: 10 }}>
              {(["home", "draw", "away"] as const).map((side) => (
                <Odd
                  key={side}
                  label={side === "draw" ? "Draw" : side === "home" ? n.home.name : n.away.name}
                  value={priceOf(side)}
                  up={(side === "home" && n.isHome) || (side === "away" && !n.isHome)}
                  disabled={!n.onTerrace}
                  onClick={() => onPick({ id: n.id, home: n.home, away: n.away }, kindFor(side))}
                />
              ))}
            </div>
            <div className="umeta" style={{ marginTop: 6 }}>
              {n.onTerrace ? `Tap a price to back it. Bookmakers' line until fans set the pool.` : "Bookmakers' prices. Betting opens on Terrace a few days before kick-off."}
            </div>

            {p && (
              <>
                <div className="flabel" style={{ marginTop: 14 }}>Prediction</div>
                <div className="pred-bar">
                  <i className="h" style={{ width: `${pct(p.percent.home)}%` }} />
                  <i className="d" style={{ width: `${pct(p.percent.draw)}%` }} />
                  <i className="a" style={{ width: `${pct(p.percent.away)}%` }} />
                </div>
                <div className="pred-labels">
                  <span>{n.home.name} {p.percent.home}</span>
                  <span>Draw {p.percent.draw}</span>
                  <span>{n.away.name} {p.percent.away}</span>
                </div>
                <div className="brief-tip"><Icon name="bolt" size={14} /> {p.advice.replace("Double chance :", "Double chance:")}</div>

                <div className="flabel" style={{ marginTop: 14 }}>Head to head</div>
                <div className="compare">
                  {(["form", "att", "def", "h2h"] as const).filter((k) => p.comparison[k]).map((k) => (
                    <div key={k} className="compare-row">
                      <span>{pct(p.comparison[k].home)}%</span>
                      <div className="compare-bar">
                        <i style={{ width: `${pct(p.comparison[k].home)}%` }} />
                      </div>
                      <span>{pct(p.comparison[k].away)}%</span>
                      <em>{{ form: "Form", att: "Attack", def: "Defence", h2h: "Meetings" }[k]}</em>
                    </div>
                  ))}
                </div>
                {p.h2h.length > 0 && (
                  <div className="h2h">
                    {p.h2h.slice(0, 3).map((g) => (
                      <div key={g.date + g.home} className="kv">
                        <span className="k">{g.home} v {g.away}</span>
                        <span className="v">{g.score} <span className="umeta">· {g.date.slice(0, 4)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <Link href={n.onTerrace ? `/m/${n.id}` : "/matches"} className="cta cta-ghost cta-sm" style={{ marginTop: 12 }}>
              {n.onTerrace ? "Open the match room" : "See all fixtures"}
            </Link>
          </>
        )}
      </div>
      {picking && <TeamPicker onClose={() => setPicking(false)} />}
    </div>
  );
}

function FormPills({ form }: { form: string }) {
  if (!form) return null;
  return (
    <span className="form-pills" title="Last five league games">
      {form.split("").map((r, i) => (
        <i key={i} className={r === "W" ? "w" : r === "L" ? "l" : "d"}>{r}</i>
      ))}
    </span>
  );
}
