"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Badge, usd } from "./ui";
import { query } from "@/lib/indexer";
import { useMatches, type MatchLite } from "@/lib/useMatches";

type Row = {
  id: string;
  text: string;
  room_id: string;
  market: { id: string; yesPool: string; noPool: string; bettors: number; isFlash: boolean; isSealed: boolean; question: { answer: number; closeTime: string } } | null;
};

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);

/** Trending, as on the Solana home screen: open take markets (by heat) or the matches themselves. */
export function Trending() {
  const matches = useMatches();
  const [tab, setTab] = useState<"takes" | "matches">("takes");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    query<{ Message: Row[] }>(
      `{ Message(where: { market_id: { _is_null: false } }, order_by: { heat: desc }, limit: 8) {
          id text room_id market { id yesPool noPool bettors isFlash isSealed question { answer closeTime } } } }`,
    ).then((d) => setRows(d.Message)).catch(() => setRows([]));
  }, []);

  const now = Date.now() / 1000;
  const live = [...matches.values()].filter((m) => !["FT", "AET", "PEN"].includes(m.status)).slice(0, 8);
  const crest = (m?: MatchLite) => (m ? <img src={m.home.logo} alt="" /> : <Icon name="ball" size={22} />);

  return (
    <>
      <div className="section-head">
        <h3>Trending</h3>
        <div className="seg" style={{ marginLeft: "auto" }}>
          <button className={tab === "takes" ? "on" : undefined} onClick={() => setTab("takes")}>Takes</button>
          <button className={tab === "matches" ? "on" : undefined} onClick={() => setTab("matches")}>Matches</button>
        </div>
      </div>
      <div className="mrows">
        {tab === "takes" &&
          (rows ?? []).filter((r) => !r.text.startsWith("E2E ")).map((r) => {
            const mk = r.market!;
            const m = matches.get(Number(r.room_id.split("-")[1]));
            const yes = Number(mk.yesPool);
            const total = yes + Number(mk.noPool);
            const open = mk.question.answer === 0 && Number(mk.question.closeTime) > now;
            return (
              <Link key={r.id} href={`/m/${r.room_id.split("-")[1]}#take-${r.id}`} className="mrow">
                <span className="tile">{crest(m)}</span>
                <span className="body">
                  <div className="title">{r.text}</div>
                  <div className="sub">{m ? `${m.home.name} v ${m.away.name}` : "Match room"}</div>
                  <div className="pills">
                    <span className="pill-stat yes">BACK {total ? Math.round((yes / total) * 100) : 50}%</span>
                    <span className="pill-stat">Vol {usd(total)}</span>
                    {mk.isSealed ? <Badge tone="sealed">Sealed</Badge> : mk.isFlash ? <Badge tone="flash">Flash</Badge> : <Badge tone={open ? "open" : "settled"}>{open ? "Open" : "Closed"}</Badge>}
                  </div>
                </span>
                <span className="chev"><Icon name="chevronRight" size={16} /></span>
              </Link>
            );
          })}
        {tab === "takes" && rows?.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>No markets yet. Be the first: tap +.</p>}
        {tab === "matches" &&
          live.map((m) => (
            <Link key={m.id} href={`/m/${m.id}`} className="mrow">
              <span className="tile">{crest(m)}</span>
              <span className="body">
                <div className="title">{m.home.name} v {m.away.name}</div>
                <div className="sub">{LIVE.has(m.status) ? "Live now" : new Date(m.kickoff * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </span>
              {LIVE.has(m.status) ? <Badge tone="live">LIVE</Badge> : <span className="chev"><Icon name="chevronRight" size={16} /></span>}
            </Link>
          ))}
      </div>
    </>
  );
}
