"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { BetSheet, type BetPick } from "./BetSheet";
import { ChallengeSheet } from "./ChallengeSheet";
import { CommentsSheet } from "./CommentsSheet";
import { FanSheet } from "./FanSheet";
import { FollowButton } from "./FollowButton";
import { ActivityTicker } from "./ActivityTicker";
import { Header, shareLink } from "./Header";
import { Icon } from "./Icon";
import { LIVE } from "./MatchRow";
import { LocalTime } from "./LocalTime";
import { SignIn } from "./SignIn";
import { Avatar, Badge, Crest, Empty, FixtureTag, Odd, Seg, Sheet, ago, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { showError } from "@/lib/errors";
import { useFollows } from "@/lib/follows";
import { query } from "@/lib/indexer";
import { points } from "@/lib/terracePoints";
import { questionLabel } from "@/lib/labels";
import { REACTIONS, reactNote } from "@/lib/streak";
import { fractional, price } from "@/lib/odds";
import { backTake, bet } from "@/lib/play";
import { useMatches, type MatchLite } from "@/lib/useMatches";
import "@/styles/social.css";

type Q = { id?: string; text: string; kind: number; line: number; answer: number; closeTime: string };
type Post = {
  id: string;
  text: string;
  author: string;
  postedAt: string;
  backers: number;
  heat: string;
  room_id: string;
  market: {
    id: string; token: string; feeBps: number; isSealed: boolean; yesPool: string; noPool: string; bettors: number; question: Q;
    bets: { bettor: string; side: number; stake: string }[];
  } | null;
};
type Moment = { id: string; kind: string; actor: string; amount: string | null; text: string | null; timestamp: string; league: { id: string; name: string } | null; market: { question: Q & { fixture: { id: string } | null } } | null };
type Fan = { id: string; points: string; wins: number; results: number; winRateBps: number; streak: number; isAgent: boolean; followers: number };
type Tab = "foryou" | "following" | "leaderboard";
type Reacts = { counts: Record<string, Record<string, number>>; mine: Record<string, string> };
type Row = { t: "post"; p: Post } | { t: "moment"; m: Moment } | { t: "more"; author: string; n: number } | { t: "people" };

const MOMENTS = ["WIN", "ACCA", "ACCA_WON", "CHALLENGE", "CHALLENGE_WON", "TITLE", "AGENT", "LEAGUE_JOIN"];
const WON = new Set(["WIN", "ACCA_WON", "CHALLENGE_WON", "TITLE"]);
const PER_AUTHOR = 4; // For you: at most this many takes per fan before "See more from…"
const OUTCOME = ["", "Came in", "Didn't happen", "Void · refunded"] as const;

const fixtureOf = (p: Post) => Number(p.room_id.split("-")[1]);
const isOpen = (q: Q, now: number) => q.answer === 0 && Number(q.closeTime) > now;
const short = (unix: string) => ago(unix).replace(" min ago", "m").replace(" ago", "").replace("just now", "now");

/** Ranked like /api/feed: engagement heat, decayed by age so fresh takes break through. */
const rank = (p: Post, now: number) => (Number(p.heat) + 1) / Math.pow((now - Number(p.postedAt)) / 3600 + 2, 1.5);

/** No fan twice in a row, and at most PER_AUTHOR takes each; the rest fold into one "more" row. */
function diversify(list: Post[]): Row[] {
  const count = new Map<string, number>();
  const kept: Post[] = [];
  const folded = new Map<string, number>();
  for (const p of list) {
    const n = count.get(p.author) ?? 0;
    if (n < PER_AUTHOR) kept.push(p);
    else folded.set(p.author, (folded.get(p.author) ?? 0) + 1);
    count.set(p.author, n + 1);
  }
  const out: Post[] = [];
  const pool = [...kept];
  while (pool.length) {
    const last = out[out.length - 1]?.author;
    const i = pool.findIndex((p) => p.author !== last);
    out.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
  }
  const rows: Row[] = out.map((p) => ({ t: "post", p }));
  for (const [author, n] of folded) {
    const at = rows.map((r) => (r.t === "post" ? r.p.author : "")).lastIndexOf(author);
    rows.splice(at + 1, 0, { t: "more", author, n });
  }
  return rows;
}

/** The Feed: fans' takes as posts, with the crowd on each one, wins in between, and who to follow. */
export function Social() {
  const { status, address, send, sign } = useAccount();
  const agents = useAgents();
  const matches = useMatches();
  const { follows } = useFollows();
  const [tab, setTab] = useState<Tab>("foryou");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [rooms, setRooms] = useState<Map<number, number>>(new Map());
  const [fans, setFans] = useState<Fan[]>([]);
  const [ranked, setRanked] = useState<{ id: string; terracePoints: string; dayStreak: number }[] | null>(null);
  const [board, setBoard] = useState<"points" | "winrate">("points");
  const [pick, setPick] = useState<BetPick | null>(null);
  const [fan, setFan] = useState<string | null>(null);
  const [duel, setDuel] = useState<Post | null>(null);
  const [backed, setBacked] = useState<Set<string>>(new Set());
  const [signIn, setSignIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Map<string, number>>(new Map());
  const [reacts, setReacts] = useState<Reacts>({ counts: {}, mine: {} });
  const [comments, setComments] = useState<Post | null>(null);
  const me = address?.toLowerCase();

  const load = useCallback(async () => {
    const since = Math.floor(Date.now() / 1000) - 3 * 86_400;
    try {
      const d = await query<{ Message: Post[]; FeedItem: Moment[]; Player: Fan[] }>(
        `query F($since: numeric!, $kinds: [String!]) {
          Message(where: { postedAt: { _gte: $since }, room_id: { _like: "match-%" }, replyTo: { _is_null: true } }, order_by: { postedAt: desc }, limit: 150) {
            id text author postedAt backers heat room_id
            market { id token feeBps isSealed yesPool noPool bettors question { id text kind line answer closeTime } bets(limit: 40) { bettor side stake } }
          }
          FeedItem(where: { kind: { _in: $kinds } }, order_by: { timestamp: desc }, limit: 40) {
            id kind actor amount text timestamp league { id name } market { question { text kind line answer closeTime fixture { id } } }
          }
          Player(where: { _or: [{ results: { _gt: 0 } }, { messages: { _gt: 0 } }, { predictions: { _gt: 0 } }, { isAgent: { _eq: true } }] }, order_by: [{ points: desc }, { winRateBps: desc }, { messages: desc }], limit: 30) { id points wins results winRateBps streak isAgent followers }
        }`,
        { since, kinds: MOMENTS },
      );
      const list = d.Message.filter((m) => !m.text.startsWith("E2E "));
      setPosts(list);
      const ids = list.map((m) => m.id);
      if (ids.length)
        query<{ Message: { replyTo: string }[] }>(`query R($ids: [String!]) { Message(where: { replyTo: { _in: $ids } }, limit: 1000) { replyTo } }`, { ids })
          .then((r) => {
            const n = new Map<string, number>();
            for (const x of r.Message) n.set(x.replyTo, (n.get(x.replyTo) ?? 0) + 1);
            setReplies(n);
          })
          .catch(() => {});
      setMoments(d.FeedItem.filter((i) => !i.market?.question.text.startsWith("E2E ")));
      setFans(d.Player);
      query<{ Player: { id: string; terracePoints: string; dayStreak: number }[] }>(
        `{ Player(where: { terracePoints: { _gt: "0" }, isAgent: { _eq: false } }, order_by: { terracePoints: desc }, limit: 30) { id terracePoints dayStreak } }`,
      ).then((x) => setRanked(x.Player)).catch(() => setRanked(null));
    } catch {
      setPosts((cur) => cur ?? []);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  // Emoji reactions (Azure Table Storage via /api/reactions), refreshed a little slower than the feed.
  const postIds = useMemo(() => (posts ?? []).map((p) => p.id).join(","), [posts]);
  const loadReacts = useCallback(async () => {
    if (!postIds) return;
    try {
      const r = await fetch(`/api/reactions?ids=${postIds}${me ? `&me=${me}` : ""}`);
      if (r.ok) setReacts(await r.json());
    } catch {}
  }, [postIds, me]);
  useEffect(() => {
    loadReacts();
    const t = setInterval(() => document.visibilityState === "visible" && loadReacts(), 15_000);
    return () => clearInterval(t);
  }, [loadReacts]);

  async function react(p: Post, emoji: string) {
    if (status !== "ready" || !address) return setSignIn("Sign in to react to takes.");
    const before = reacts;
    const prev = reacts.mine[p.id] ?? "";
    const next = prev === emoji ? "" : emoji; // same emoji again takes it back
    // Optimistic
    const counts = { ...(reacts.counts[p.id] ?? {}) };
    if (prev) counts[prev] = Math.max(0, (counts[prev] ?? 1) - 1);
    if (next) counts[next] = (counts[next] ?? 0) + 1;
    const mine = { ...reacts.mine };
    if (next) mine[p.id] = next;
    else delete mine[p.id];
    setReacts({ counts: { ...reacts.counts, [p.id]: counts }, mine });
    try {
      const at = Math.floor(Date.now() / 1000);
      const signature = await sign(reactNote(address, p.id, next, at));
      const r = await fetch("/api/reactions", { method: "POST", body: JSON.stringify({ address, post: p.id, emoji: next, at, signature }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "That reaction didn't go through.");
    } catch (e) {
      setReacts(before);
      setError(e instanceof Error ? e.message : showError(e));
    }
  }

  // Match rooms worth walking into: live first, then the next kick-offs.
  const roomList = useMemo(() => {
    const now = Date.now() / 1000;
    return [...matches.values()]
      .filter((m) => LIVE.has(m.status) || (m.status === "NS" && m.kickoff > now && m.kickoff - now < 36 * 3600))
      .sort((a, b) => Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) || a.kickoff - b.kickoff)
      .slice(0, 12);
  }, [matches]);
  useEffect(() => {
    if (!roomList.length) return;
    query<{ Room: { id: string; messageCount: number }[] }>(`query R($ids: [String!]) { Room(where: { id: { _in: $ids } }) { id messageCount } }`, { ids: roomList.map((m) => `match-${m.id}`) })
      .then((d) => setRooms(new Map(d.Room.map((r) => [Number(r.id.split("-")[1]), r.messageCount]))))
      .catch(() => {});
  }, [roomList]);

  const name = useCallback((a: string) => (a === me ? "You" : agents.get(a) || fanName(a)), [me, agents]);
  const now = Date.now() / 1000;

  const rows = useMemo<Row[]>(() => {
    if (!posts) return [];
    if (tab === "following") {
      const theirs = posts.filter((p) => follows.has(p.author) || p.market?.bets.some((b) => follows.has(b.bettor)));
      const wins = moments.filter((m) => follows.has(m.actor));
      return [
        ...theirs.map((p) => ({ t: "post" as const, p, at: Number(p.postedAt) })),
        ...wins.map((m) => ({ t: "moment" as const, m, at: Number(m.timestamp) })),
      ].sort((a, b) => b.at - a.at);
    }
    const t = Date.now() / 1000;
    const base = diversify([...posts].sort((a, b) => rank(b, t) - rank(a, t)));
    // A win or a 1v1 after every third take, and "people to follow" once the feed has warmed up.
    const out: Row[] = [];
    let n = 0, w = 0;
    for (const r of base) {
      out.push(r);
      if (r.t !== "post") continue;
      n++;
      if (n === 4) out.push({ t: "people" });
      if (n % 3 === 0 && w < moments.length) out.push({ t: "moment", m: moments[w++] });
    }
    while (w < Math.min(moments.length, 6)) out.push({ t: "moment", m: moments[w++] });
    if (n < 4) out.push({ t: "people" });
    return out;
  }, [posts, moments, tab, follows]);

  const toFollow = fans.filter((f) => f.id !== me && !follows.has(f.id)).sort((a, b) => b.winRateBps - a.winRateBps || b.followers - a.followers || b.results - a.results).slice(0, 8);

  function openBet(p: Post, side: 1 | 2) {
    const mk = p.market!;
    const m = matches.get(fixtureOf(p));
    const yes = Number(mk.yesPool), no = Number(mk.noPool);
    setPick({
      eyebrow: `${m ? `${m.home.name} v ${m.away.name}` : "Take"} · ${name(p.author)}'s take`,
      label: side === 1 ? `Back: ${questionLabel(mk.question, m)}` : `Fade: ${questionLabel(mk.question, m)}`,
      side,
      pool: side === 1 ? { side: yes, other: no } : { side: no, other: yes },
      feeBps: mk.feeBps,
      note: "Settled by Chainlink from the match data.",
      place: (dollars) => bet(send, address as Address, BigInt(mk.id), mk.token as Address, side, dollars),
    });
  }

  async function back(p: Post) {
    if (status !== "ready") return setSignIn("Sign in to back takes and follow fans.");
    if (backed.has(p.id)) return;
    setBacked((s) => new Set(s).add(p.id)); // optimistic
    setError(null);
    try {
      await backTake(send, BigInt(p.id));
    } catch (e) {
      setBacked((s) => { const n = new Set(s); n.delete(p.id); return n; });
      setError(showError(e));
    }
  }

  return (
    <>
      <Header title="The Feed" sub="Takes, calls and wins from the terrace" balance={false} search />
      <ActivityTicker />

      {roomList.length > 0 && (
        <div className="rooms" aria-label="Match rooms">
          {roomList.map((m) => {
            const live = LIVE.has(m.status);
            const n = rooms.get(m.id) ?? 0;
            return (
              <Link key={m.id} href={`/m/${m.id}#compose`} className={`room-chip${live ? " live" : ""}`}>
                <span className="room-crests"><Crest logo={m.home.logo} name={m.home.name} /><Crest logo={m.away.logo} name={m.away.name} /></span>
                <span className="room-when">{live ? <><i className="livedot" /> {m.status === "HT" ? "HT" : `${m.elapsed ?? 0}'`}</> : <LocalTime unix={m.kickoff} />}</span>
                <span className="room-n">{n ? `${n} take${n > 1 ? "s" : ""}` : "Start it"}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ padding: "10px var(--gutter) 10px" }}>
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: "foryou", label: "For you" },
            { id: "following", label: "Following" },
            { id: "leaderboard", label: "Top fans" },
          ]}
        />
      </div>

      <div className="pad page-enter" key={tab} style={{ paddingTop: 2 }}>
        {tab !== "leaderboard" && (
          <>
            <Link href="/take" className="card compose-stub">
              <Avatar seed={me ?? "visitor"} name={me ? undefined : "You"} size={36} />
              <span className="compose-ph">What&apos;s your take for today?</span>
              <span className="compose-go"><Icon name="plus" size={16} /> Post</span>
            </Link>
            {error && <p className="error" style={{ margin: "8px 0" }}>{error}</p>}

            {posts === null && [0, 1, 2].map((i) => <div key={i} className="card post sk-post"><div className="sk" style={{ height: 14, width: "40%" }} /><div className="sk" style={{ height: 18, marginTop: 12 }} /><div className="sk" style={{ height: 52, marginTop: 12 }} /></div>)}
            {posts !== null && rows.length === 0 &&
              (tab === "following" ? (
                <Empty title="Your feed is empty" action={<button className="textbtn" onClick={() => setTab("leaderboard")}>Find fans to follow ›</button>}>
                  Follow fans and their takes, and the takes they back, land here.
                </Empty>
              ) : (
                <Empty title="Quiet so far">Post a take and start the conversation.</Empty>
              ))}

            {rows.map((r, idx) => (
              <Fragment key={r.t === "post" ? `p${r.p.id}` : r.t === "moment" ? `m${r.m.id}` : r.t === "more" ? `x${r.author}` : `people${idx}`}>
                {r.t === "post" && (
                  <PostCard
                    p={r.p} me={me} now={now} name={name} agents={agents} follows={follows} matches={matches}
                    backed={backed.has(r.p.id)} onFan={setFan} onBack={() => back(r.p)} onPick={(s) => openBet(r.p, s)}
                    reactions={reacts.counts[r.p.id] ?? {}} myReaction={reacts.mine[r.p.id]} onReact={(e) => react(r.p, e)}
                    comments={replies.get(r.p.id) ?? 0} onComments={() => setComments(r.p)}
                    onDuel={() => (status === "ready" ? setDuel(r.p) : setSignIn("Sign in to challenge a mate."))}
                  />
                )}
                {r.t === "moment" && <MomentCard i={r.m} name={name(r.m.actor)} isAgent={agents.has(r.m.actor)} mine={r.m.actor === me} matches={matches} onFan={setFan} />}
                {r.t === "more" && (
                  <button className="more-from" onClick={() => setFan(r.author)}>
                    <Avatar seed={r.author} name={agents.get(r.author) || undefined} size={22} />
                    More takes from {name(r.author)} <Icon name="chevronRight" size={14} />
                  </button>
                )}
                {r.t === "people" && toFollow.length > 0 && (
                  <div className="people">
                    <div className="sec-hd" style={{ padding: "0 0 8px" }}><h3>Fans to follow</h3></div>
                    <div className="people-row">
                      {toFollow.map((f) => (
                        <div key={f.id} className="person">
                          <button className="person-tap" onClick={() => setFan(f.id)}>
                            <Avatar seed={f.id} name={agents.get(f.id) || undefined} size={52} />
                            <span className="uname">{name(f.id)}</span>
                            <span className="umeta">{f.results ? `${Math.round(f.winRateBps / 100)}% · ${f.results} call${f.results > 1 ? "s" : ""}` : f.isAgent ? "AI pundit" : "New fan"}</span>
                          </button>
                          <FollowButton who={f.id} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
          </>
        )}

        {tab === "leaderboard" && (
          <>
            {ranked && ranked.length > 0 && (
              <div style={{ margin: "4px 0 10px" }}>
                <Seg sub options={[{ id: "points", label: "Terrace Points" }, { id: "winrate", label: "Win rate" }]} value={board} onChange={setBoard} />
              </div>
            )}
            {board === "points" && ranked && ranked.length > 0 ? (
              <>
                <div className="eyebrow amber" style={{ margin: "4px 0 8px" }}>Founding fans · Terrace Points</div>
                <div className="card rowlist" style={{ padding: "4px 14px" }}>
                  {ranked.map((f, n) => (
                    <div key={f.id} className={`listrow${f.id === me ? " lb-me" : ""}`}>
                      <span className={`lb-rank${n < 3 ? ` p${n + 1}` : ""}`}>{n + 1}</span>
                      <button className="fan-tap" onClick={() => setFan(f.id)}>
                        <Avatar seed={f.id} size={34} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="uname" style={f.id === me ? { color: "var(--green)" } : undefined}>{name(f.id)}</div>
                          <div className="umeta">{f.dayStreak > 1 ? `${f.dayStreak}-day run` : "Early fan"}</div>
                        </div>
                      </button>
                      <div className="lb-rate amber">{points(f.terracePoints)}<small>POINTS</small></div>
                      {f.id !== me && <FollowButton who={f.id} />}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="eyebrow" style={{ margin: "4px 0 8px" }}>Top fans · win rate</div>
                <div className="card rowlist" style={{ padding: "4px 14px" }}>
                  {fans.map((f, n) => (
                    <div key={f.id} className={`listrow${f.id === me ? " lb-me" : ""}`}>
                      <span className={`lb-rank${n < 3 ? ` p${n + 1}` : ""}`}>{n + 1}</span>
                      <button className="fan-tap" onClick={() => setFan(f.id)}>
                        <Avatar seed={f.id} size={34} name={agents.get(f.id) || undefined} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="uname" style={f.id === me ? { color: "var(--green)" } : undefined}>
                            {name(f.id)} {f.isAgent && <Badge tone="private">AI</Badge>}
                          </div>
                          <div className="umeta">{f.points} pts · {f.results} calls{f.streak > 1 ? ` · ${f.streak} win streak` : ""}</div>
                        </div>
                      </button>
                      <div className="lb-rate">{f.results ? `${Math.round(f.winRateBps / 100)}%` : "–"}<small>WIN RATE</small></div>
                      {f.id !== me && <FollowButton who={f.id} />}
                    </div>
                  ))}
                  {fans.length === 0 && <div className="listrow umeta">No settled calls yet. The first results land after today&apos;s matches.</div>}
                </div>
              </>
            )}
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
      {fan && <FanSheet who={fan} name={agents.get(fan) || undefined} onClose={() => setFan(null)} />}
      {duel?.market && (
        <ChallengeSheet label={duel.market.question.kind ? questionLabel(duel.market.question, matches.get(fixtureOf(duel))) : duel.text} getQuestionId={async () => BigInt(duel.market!.question.id!)} onClose={() => setDuel(null)} />
      )}
      {comments && (
        <CommentsSheet
          take={{ id: comments.id, text: comments.text, author: comments.author, fixtureId: fixtureOf(comments) }}
          onFan={(a) => { setComments(null); setFan(a); }}
          onClose={() => setComments(null)}
          onPosted={() => setReplies((m) => new Map(m).set(comments.id, (m.get(comments.id) ?? 0) + 1))}
        />
      )}
      {signIn && (
        <Sheet onClose={() => setSignIn(null)}>
          <SignIn bare reason={signIn} />
        </Sheet>
      )}
    </>
  );
}

function PostCard({
  p, me, now, name, agents, follows, matches, backed, onFan, onBack, onPick, onDuel, reactions, myReaction, onReact, comments, onComments,
}: {
  p: Post; me?: string; now: number; name: (a: string) => string; agents: Map<string, string>; follows: Set<string>; matches: Map<number, MatchLite>;
  backed: boolean; onFan: (a: string) => void; onBack: () => void; onPick: (side: 1 | 2) => void; onDuel: () => void;
  reactions: Record<string, number>; myReaction?: string; onReact: (emoji: string) => void; comments: number; onComments: () => void;
}) {
  const mk = p.market;
  const m = matches.get(fixtureOf(p));
  const mine = p.author === me;
  const isAgent = agents.has(p.author);
  const open = !!mk && isOpen(mk.question, now);
  const answer = mk?.question.answer ?? 0;
  const yes = Number(mk?.yesPool ?? 0), no = Number(mk?.noPool ?? 0), total = yes + no;
  const yesPct = total ? Math.round((yes / total) * 100) : 50;
  const odds = (s: 1 | 2) => fractional(price(s === 1 ? { side: yes, other: no } : { side: no, other: yes }).decimal);
  const crowd = (mk?.bets ?? []).filter((b) => b.bettor !== p.author);
  const friend = (mk?.bets ?? []).find((b) => b.bettor !== p.author && b.bettor !== me && follows.has(b.bettor));
  const backers = p.backers + (backed ? 1 : 0);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const shown = REACTIONS.filter((e) => (reactions[e] ?? 0) > 0);

  async function share() {
    const url = `${window.location.origin}/m/${fixtureOf(p)}#take-${p.id}`;
    if (await shareLink("Terrace", `"${p.text}" ${mine ? "My" : `${name(p.author)}'s`} take on Terrace. Back it or fade it.`, url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <article className={`card post${answer === 1 ? " came-in" : answer === 2 ? " missed" : ""}`} id={`post-${p.id}`}>
      {friend && (
        <div className="post-ctx"><Icon name="users" size={13} /> {name(friend.bettor)} {friend.side === 2 ? "faded" : "backed"} this</div>
      )}
      <div className="post-hd">
        <button className="post-av" onClick={() => onFan(p.author)} aria-label={`${name(p.author)}'s profile`}>
          <Avatar seed={p.author} name={isAgent ? name(p.author) : undefined} size={40} />
        </button>
        <div className="post-who">
          <button className="post-name" onClick={() => onFan(p.author)}>
            {name(p.author)} {isAgent && <Badge tone="private">AI</Badge>}
          </button>
          <span className="umeta">{short(p.postedAt)}{m ? <> · <Link href={`/m/${m.id}`} className="post-fx"><FixtureTag m={m} crests /></Link></> : null}</span>
        </div>
        {!mine && !follows.has(p.author) && <FollowButton who={p.author} />}
      </div>

      <p className="post-text">{p.text}</p>

      {mk && (
        <div className="post-mkt">
          <div className="crowd">
            <div className="crowd-bar" aria-label={`${yesPct}% backing`}>
              <span className="y" style={{ width: `${yesPct}%` }} />
              <span className="n" style={{ width: `${100 - yesPct}%` }} />
            </div>
            <div className="crowd-labels">
              <span className="y">{yesPct}% back</span>
              <span className="crowd-mid">
                {crowd.length > 0 && (
                  <span className="stack">
                    {crowd.slice(0, 4).map((b) => <Avatar key={b.bettor} seed={b.bettor} name={agents.get(b.bettor) || undefined} size={20} />)}
                  </span>
                )}
                {usd(total)} on it · {mk.bettors} in
              </span>
              <span className="n">{100 - yesPct}% fade</span>
            </div>
          </div>
          {open ? (
            <div className="oddsrow two">
              <Odd tone="yes" label="Back it" value={odds(1)} onClick={() => onPick(1)} />
              <Odd tone="no" label="Fade it" value={odds(2)} onClick={() => onPick(2)} />
            </div>
          ) : (
            <div className="post-result">
              <Badge tone={answer === 1 ? "won" : answer === 2 ? "lost" : answer === 3 ? "settled" : "amber"}>{answer ? OUTCOME[answer] : "Settling"}</Badge>
              <span className="umeta">{answer ? "Settled by Chainlink from the match data" : "Chainlink settles it after full time"}</span>
            </div>
          )}
        </div>
      )}

      {(shown.length > 0 || picking) && (
        <div className="reacts">
          {shown.map((e) => (
            <button key={e} className={`react${myReaction === e ? " on" : ""}`} onClick={() => onReact(e)} aria-pressed={myReaction === e}>
              {e} <b>{reactions[e]}</b>
            </button>
          ))}
          {picking && (
            <div className="react-pick" role="menu">
              {REACTIONS.map((e) => (
                <button key={e} className={myReaction === e ? "on" : undefined} onClick={() => { onReact(e); setPicking(false); }} aria-label={`React ${e}`}>{e}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="post-actions">
        <button className={`pa${myReaction ? " on-react" : ""}`} onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-label="React">
          {myReaction ? <span className="pa-emoji">{myReaction}</span> : <Icon name="smile" size={17} />} <span>React</span>
        </button>
        <button className="pa" onClick={onComments} aria-label={`${comments} comments`}>
          <Icon name="chat" size={17} /> {comments > 0 ? comments : ""} <span>{comments ? "" : "Comment"}</span>
        </button>
        {!mk && (
          <button className={`pa${backed ? " on" : ""}`} onClick={onBack} disabled={mine} aria-pressed={backed}>
            <Icon name="flame" size={17} /> {backers > 0 ? backers : ""} <span>{backed ? "Backing" : "Back"}</span>
          </button>
        )}
        {mk && open && <button className="pa" onClick={onDuel}><Icon name="swords" size={17} /> <span>1v1</span></button>}
        <button className="pa" onClick={share} style={{ marginLeft: "auto" }} aria-label="Share"><Icon name="share" size={17} />{copied && <span>Copied</span>}</button>
      </div>
    </article>
  );
}

function MomentCard({
  i, name, isAgent, mine, matches, onFan,
}: { i: Moment; name: string; isAgent: boolean; mine: boolean; matches: Map<number, MatchLite>; onFan: (a: string) => void }) {
  const q = i.market?.question;
  const m = q?.fixture ? matches.get(Number(q.fixture.id)) : undefined;
  const what = q ? questionLabel(q, m) : null;
  const won = WON.has(i.kind);
  const [copied, setCopied] = useState(false);

  let line: React.ReactNode = null;
  if (i.kind === "WIN") line = <>called it{what ? <> on <b>{what}</b></> : null}</>;
  else if (i.kind === "ACCA") line = <>placed a <b>{i.text}</b> parlay</>;
  else if (i.kind === "ACCA_WON") line = <>landed a <b>{i.text}</b> parlay</>;
  else if (i.kind === "CHALLENGE") line = <>threw down a 1v1{what ? <> on <b>{what}</b></> : null}</>;
  else if (i.kind === "CHALLENGE_WON") line = <>won a 1v1{what ? <> on <b>{what}</b></> : null}</>;
  else if (i.kind === "TITLE") line = <>won <b>{i.text}</b></>;
  else if (i.kind === "AGENT") line = <>joined the terrace as an AI pundit</>;
  else if (i.kind === "LEAGUE_JOIN") line = <>joined <b>{i.league?.name ?? i.text ?? "a league"}</b></>;

  async function share() {
    const amount = i.amount && Number(i.amount) > 0 ? ` +${usd(i.amount)}` : "";
    const text = `${mine ? "I" : name} ${i.kind === "WIN" ? `called it${what ? ` on "${what}"` : ""}` : i.kind === "ACCA_WON" ? `landed a ${i.text} parlay` : i.kind === "CHALLENGE_WON" ? "won a 1v1" : `won ${i.text ?? "a league"}`} on Terrace.${amount}`;
    if (await shareLink("Terrace", text, `${window.location.origin}${m ? `/m/${m.id}` : "/social"}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className={`card moment${won ? " won" : ""}`}>
      <button className="post-av" onClick={() => onFan(i.actor)} aria-label={`${name}'s profile`}>
        <Avatar seed={i.actor} name={isAgent ? name : undefined} size={32} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="moment-line">
          <button className="post-name" onClick={() => onFan(i.actor)}>{name}</button> {isAgent && <Badge tone="private">AI</Badge>} {line}
        </div>
        <div className="umeta">
          {short(i.timestamp)}
          {won && <> · <button className="feed-share" onClick={share}>{copied ? "Copied" : "Share"}</button></>}
        </div>
      </div>
      {won && i.amount && Number(i.amount) > 0 ? <span className="win-amount">+{usd(i.amount)}</span> : won ? <Icon name="trophy" size={20} /> : null}
    </div>
  );
}
