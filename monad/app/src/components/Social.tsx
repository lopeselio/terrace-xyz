"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { BetSheet, type BetPick } from "./BetSheet";
import { FollowButton } from "./FollowButton";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { Avatar, Badge, Empty, Odd, Seg, SkeletonCards, ago, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { useFollows } from "@/lib/follows";
import { query } from "@/lib/indexer";
import { questionLabel, sideLabel } from "@/lib/labels";
import { fractional, price } from "@/lib/odds";
import { bet } from "@/lib/play";
import { useMatches, type MatchLite } from "@/lib/useMatches";
import "@/styles/social.css";

type Q = { text: string; kind: number; line: number; answer: number; closeTime: string; fixture: { id: string } | null };
type Item = {
  id: string;
  kind: string;
  actor: string;
  amount: string | null;
  text: string | null;
  timestamp: string;
  league: { id: string; name: string } | null;
  market: { id: string; token: string; feeBps: number; yesPool: string; noPool: string; bettors: number; isSealed: boolean; question: Q } | null;
};
type Fan = { id: string; points: string; wins: number; results: number; winRateBps: number; streak: number; isAgent: boolean };
type Tab = "following" | "discover" | "leaderboard";

const KINDS = ["BET", "WIN", "ACCA", "ACCA_WON", "CHALLENGE", "CHALLENGE_WON", "TITLE", "AGENT", "LEAGUE_JOIN"];
const WON = new Set(["WIN", "ACCA_WON", "CHALLENGE_WON", "TITLE"]);

/** The Feed (screen-social.html): who is backing what. Copy a bet, fade it, follow the sharp ones. */
export function Social() {
  const { address, send } = useAccount();
  const agents = useAgents();
  const matches = useMatches();
  const { follows } = useFollows();
  const [tab, setTab] = useState<Tab>("discover");
  const [items, setItems] = useState<Item[] | null>(null);
  const [sides, setSides] = useState<Map<string, number>>(new Map());
  const [fans, setFans] = useState<Fan[]>([]);
  const [pick, setPick] = useState<BetPick | null>(null);
  const me = address?.toLowerCase();

  const load = useCallback(async () => {
    try {
      const d = await query<{ FeedItem: Item[]; Player: Fan[] }>(
        `query F($kinds: [String!]) {
          FeedItem(where: { kind: { _in: $kinds } }, order_by: { timestamp: desc }, limit: 50) {
            id kind actor amount text timestamp league { id name }
            market { id token feeBps yesPool noPool bettors isSealed question { text kind line answer closeTime fixture { id } } }
          }
          Player(where: { _or: [{ results: { _gt: 0 } }, { messages: { _gt: 0 } }, { predictions: { _gt: 0 } }, { isAgent: { _eq: true } }] }, order_by: [{ points: desc }, { winRateBps: desc }, { messages: desc }], limit: 30) { id points wins results winRateBps streak isAgent }
        }`,
        { kinds: KINDS },
      );
      const list = d.FeedItem.filter((i) => !i.market?.question.text.startsWith("E2E "));
      setItems(list);
      setFans(d.Player);
      const ids = list.filter((i) => i.kind === "BET" && i.market).map((i) => `${i.market!.id}-${i.actor}`);
      if (ids.length) {
        const b = await query<{ Bet: { id: string; side: number }[] }>(`query B($ids: [String!]) { Bet(where: { id: { _in: $ids } }) { id side } }`, { ids });
        setSides(new Map(b.Bet.map((x) => [x.id, x.side])));
      }
    } catch {
      setItems((cur) => cur ?? []);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const name = (a: string) => (a === me ? "You" : agents.get(a) || fanName(a));
  const now = Date.now() / 1000;
  const shown = useMemo(() => (items ?? []).filter((i) => tab !== "following" || follows.has(i.actor)), [items, tab, follows]);
  const toFollow = fans.filter((f) => f.id !== me).sort((a, b) => b.winRateBps - a.winRateBps || b.results - a.results).slice(0, 4);

  function open(i: Item, side: 1 | 2) {
    const mk = i.market!;
    const m = mk.question.fixture ? matches.get(Number(mk.question.fixture.id)) : undefined;
    const yes = Number(mk.yesPool), no = Number(mk.noPool);
    setPick({
      eyebrow: `${m ? `${m.home.name} v ${m.away.name}` : "Take"} · ${label(mk.question, m)}`,
      label: sideLabel(side, mk.question),
      side,
      pool: side === 1 ? { side: yes, other: no } : { side: no, other: yes },
      feeBps: mk.feeBps,
      note: "Settled by Chainlink from the match data.",
      place: (dollars) => bet(send, address as Address, BigInt(mk.id), mk.token as Address, side, dollars),
    });
  }

  return (
    <>
      <Header title="The Feed" sub="Who is backing what" balance={false} search />
      <div style={{ padding: "12px var(--gutter) 10px" }}>
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: "following", label: "Following" },
            { id: "discover", label: "Discover" },
            { id: "leaderboard", label: "Leaderboard" },
          ]}
        />
      </div>

      <div className="pad page-enter" key={tab} style={{ paddingTop: 4 }}>
        {tab !== "leaderboard" && (
          <>
            {items === null && <SkeletonCards n={3} odds={2} />}
            {items !== null && shown.length === 0 &&
              (tab === "following" ? (
                <Empty title="No one followed yet" action={<button className="textbtn" onClick={() => setTab("leaderboard")}>See the leaderboard</button>}>
                  Follow the sharpest fans and their bets land here.
                </Empty>
              ) : (
                <Empty title="Quiet so far">Back a take and you&apos;ll show up here.</Empty>
              ))}
            {shown.map((i) => (
              <FeedCard key={i.id} i={i} name={name(i.actor)} isAgent={agents.has(i.actor)} side={i.market ? sides.get(`${i.market.id}-${i.actor}`) ?? 0 : 0} mine={i.actor === me} now={now} matches={matches} onPick={open} />
            ))}
            {toFollow.length > 0 && (
              <div className="sec" style={{ padding: "18px 0 0" }}>
                <div className="sec-hd"><h3>People to follow</h3></div>
                <div className="card rowlist" style={{ padding: "4px 14px" }}>
                  {toFollow.map((f) => (
                    <div key={f.id} className="listrow">
                      <Avatar seed={f.id} name={agents.get(f.id) || undefined} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="uname">{name(f.id)} {f.isAgent && <Badge tone="private">AI</Badge>}</div>
                        <div className="umeta">{f.results ? `${Math.round(f.winRateBps / 100)}% win rate · ${f.results} calls` : "No results yet · first calls in"}</div>
                      </div>
                      <FollowButton who={f.id} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "leaderboard" && (
          <>
            <div className="eyebrow" style={{ margin: "4px 0 8px" }}>Top fans · points</div>
            <div className="card rowlist" style={{ padding: "4px 14px" }}>
              {fans.map((f, n) => (
                <div key={f.id} className={`listrow${f.id === me ? " lb-me" : ""}`}>
                  <span className={`lb-rank${n < 3 ? ` p${n + 1}` : ""}`}>{n + 1}</span>
                  <Avatar seed={f.id} size={34} name={agents.get(f.id) || undefined} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="uname" style={f.id === me ? { color: "var(--green)" } : undefined}>
                      {name(f.id)} {f.isAgent && <Badge tone="private">AI</Badge>}
                    </div>
                    <div className="umeta">{f.points} pts · {f.results} calls{f.streak > 1 ? ` · ${f.streak} win streak` : ""}</div>
                  </div>
                  <div className="lb-rate">{f.results ? `${Math.round(f.winRateBps / 100)}%` : "–"}<small>WIN RATE</small></div>
                  {f.id !== me && <FollowButton who={f.id} />}
                </div>
              ))}
              {fans.length === 0 && <div className="listrow umeta">No settled calls yet. The first results land after today&apos;s matches.</div>}
            </div>
            <Link href="/leagues" className="card card-tap row" style={{ marginTop: 12 }}>
              <Icon name="trophy" size={22} />
              <div style={{ flex: 1 }}><div className="uname">Private leagues</div><div className="umeta">Your mates, one table</div></div>
              <Icon name="chevronRight" size={16} />
            </Link>
          </>
        )}
        <div style={{ height: 18 }} />
      </div>
      {pick && <BetSheet pick={pick} onClose={() => setPick(null)} onPlaced={load} />}
    </>
  );
}

function label(q: Q, m?: MatchLite) {
  return questionLabel({ ...q, fixture: q.fixture }, m);
}

function FeedCard({
  i, name, isAgent, side, mine, now, matches, onPick,
}: { i: Item; name: string; isAgent: boolean; side: number; mine: boolean; now: number; matches: Map<number, MatchLite>; onPick: (i: Item, side: 1 | 2) => void }) {
  const mk = i.market;
  const m = mk?.question.fixture ? matches.get(Number(mk.question.fixture.id)) : undefined;
  const open = !!mk && mk.question.answer === 0 && Number(mk.question.closeTime) > now;
  const yes = Number(mk?.yesPool ?? 0), no = Number(mk?.noPool ?? 0);
  const oddsFor = (s: 1 | 2) => fractional(price(s === 1 ? { side: yes, other: no } : { side: no, other: yes }).decimal);
  const won = WON.has(i.kind);
  const other = (side === 1 ? 2 : 1) as 1 | 2;

  let line: React.ReactNode = null;
  if (i.kind === "BET" && mk)
    line = side ? (
      <>{side === 1 ? "Backed" : "Faded"} <b>{label(mk.question, m)}</b> at {oddsFor(side as 1 | 2)}</>
    ) : (
      <>Sealed a pick on <b>{label(mk.question, m)}</b></>
    );
  else if (i.kind === "WIN") line = <>Called it{mk ? <> on <b>{label(mk.question, m)}</b></> : null}</>;
  else if (i.kind === "ACCA") line = <>Placed a <b>{i.text}</b> parlay</>;
  else if (i.kind === "ACCA_WON") line = <>Landed a <b>{i.text}</b> parlay</>;
  else if (i.kind === "CHALLENGE") line = <>Threw down a 1v1</>;
  else if (i.kind === "CHALLENGE_WON") line = <>Won a 1v1</>;
  else if (i.kind === "TITLE") line = <>Won <b>{i.text}</b></>;
  else if (i.kind === "AGENT") line = <>Joined the terrace as an AI player</>;
  else if (i.kind === "LEAGUE_JOIN") line = <>Joined <b>{i.league?.name ?? i.text ?? "a league"}</b></>;

  return (
    <div className={`card feed-card${won ? " won" : ""}`}>
      <div className="listrow">
        <Avatar seed={i.actor} name={isAgent ? name : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="uname">
            {name} {isAgent && <Badge tone="private">AI</Badge>}
          </div>
          <div className="umeta">{line}</div>
        </div>
        {won && i.amount ? <span className="win-amount">+{usd(i.amount)}</span> : i.amount && Number(i.amount) > 0 ? <Badge tone="open">{usd(i.amount)}</Badge> : null}
      </div>
      {i.kind === "BET" && mk && side > 0 && open && !mine && (
        <div className="oddsrow two" style={{ marginTop: 4 }}>
          <Odd tone="yes" label="Copy this bet" value={oddsFor(side as 1 | 2)} onClick={() => onPick(i, side as 1 | 2)} />
          <Odd tone="no" label="Fade it" value={oddsFor(other)} onClick={() => onPick(i, other)} />
        </div>
      )}
      <div className="meta-row">
        {i.kind === "BET" && mk && mk.bettors > 1 && (
          <span className="umeta"><Icon name="users" size={14} /> {mk.bettors - 1} others in</span>
        )}
        {i.kind === "BET" && mk && !open && <Badge tone="settled">{mk.question.answer ? "Settled" : "Closed"}</Badge>}
        <span className="umeta">{ago(i.timestamp)}</span>
        {m && (
          <Link href={`/m/${m.id}`} className="umeta" style={{ marginLeft: "auto" }}>
            {m.home.name} v {m.away.name} <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
