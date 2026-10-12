"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { Header, shareLink } from "./Header";
import { Icon } from "./Icon";
import { Room } from "./Room";
import { ScorePicker } from "./ScorePicker";
import { SignIn } from "./SignIn";
import { Avatar, Badge, Crest, Empty, Seg, SkeletonCards, fanName, money } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { publicClient } from "@/lib/chain";
import { ADDR, leaguesAbi } from "@/lib/contracts";
import { query } from "@/lib/indexer";
import {
  addGameweek, endSeason, executeProposal, finalizeGameweek, gameweekTable, getPick, hasEntered, joinLeague,
  leagueCode, ordinal, proposeGameweek, submitPicks, table, vote,
} from "@/lib/leagues";
import "@/styles/leagues.css";

type Match = { id: number; kickoff: number; status: string; home: { name: string; logo: string }; away: { name: string; logo: string }; goals: { home: number | null; away: number | null } };
type League = Awaited<ReturnType<typeof readLeague>>;
type Row = { member: Address; points: number };
type Proposal = { id: string; proposer: string; kind: number; yes: number; no: number; status: number; deadline: string; payload: string };
type Tab = "table" | "picks" | "run" | "chat";

const L = { address: ADDR.leagues, abi: leaguesAbi } as const;
const FINISHED = new Set(["FT", "AET", "PEN"]);
const ZERO_HASH = `0x${"0".repeat(64)}`;

async function readLeague(id: bigint) {
  const league = await publicClient.readContract({ ...L, functionName: "getLeague", args: [id] });
  const contests = await Promise.all(league.contestIds.map((c) => publicClient.readContract({ ...L, functionName: "getContest", args: [c] })));
  return { ...league, contests };
}

/** League detail (screen-league-detail.html): table and gameweeks, sealed picks, votes, chat. */
export function LeagueView({ leagueId, code: codeFromLink, fresh }: { leagueId: number; code: string; fresh?: boolean }) {
  const { status, address, keys, send } = useAccount();
  const agents = useAgents();
  const id = BigInt(leagueId);
  const [league, setLeague] = useState<League | null>(null);
  const [season, setSeason] = useState<Row[]>([]);
  const [gwRows, setGwRows] = useState<Row[] | null>(null);
  const [prevRows, setPrevRows] = useState<Row[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [entered, setEntered] = useState(false);
  const [picks, setPicks] = useState<Record<string, [number, number]>>({});
  const [nextGw, setNextGw] = useState<number[]>([]);
  const [code, setCode] = useState(codeFromLink);
  const [tab, setTab] = useState<Tab>("table");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await readLeague(id);
      setLeague(l);
      setSeason(await table(id, l.members));
      const n = l.contests.length;
      const cur = l.contests[n - 1];
      // A sealed gameweek's points stay hidden until it's revealed and added up.
      setGwRows(cur && (!cur.sealed_ || cur.finalized) ? await gameweekTable(l.contestIds[n - 1], l.members, cur.finalized) : null);
      const prev = l.contests[n - 2];
      setPrevRows(prev?.finalized ? await gameweekTable(l.contestIds[n - 2], l.members, true) : null);
      if (cur && address) setEntered(await hasEntered(l.contestIds[n - 1], address));
    } catch {
      setNotFound(true);
    }
    fetch("/api/matches").then((r) => r.json()).then(setMatches).catch(() => {});
    query<{ Proposal: Proposal[] }>(`query P($l: String!) { Proposal(where: { league_id: { _eq: $l } }, order_by: { deadline: desc }) { id proposer kind yes no status deadline payload } }`, { l: String(leagueId) })
      .then((d) => setProposals(d.Proposal))
      .catch(() => {});
  }, [id, leagueId, address]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  // Open (unsealed) gameweeks: show the fan's saved picks so they can change them.
  const contestKey = league ? `${league.contestIds.length}` : "";
  useEffect(() => {
    if (!league || !address || !entered) return;
    const n = league.contests.length;
    const cur = league.contests[n - 1];
    if (!cur || cur.sealed_) return;
    Promise.all(cur.fixtureIds.map((f) => getPick(league.contestIds[n - 1], address, f)))
      .then((ps) => setPicks((old) => (Object.keys(old).length ? old : Object.fromEntries(ps.map((p, i) => [cur.fixtureIds[i].toString(), [p.home, p.away] as [number, number]])))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestKey, address, entered]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (notFound)
    return (
      <>
        <Header title="League" back="/leagues" />
        <Empty title="No league here">Check the invite link with whoever sent it.</Empty>
      </>
    );
  if (!league)
    return (
      <>
        <Header title="League" back="/leagues" />
        <div className="sec"><SkeletonCards n={2} /></div>
      </>
    );

  const me = address?.toLowerCase();
  const isMe = (a: string) => a.toLowerCase() === me;
  const member = !!me && league.members.some(isMe);
  const creator = !!me && isMe(league.creator);
  const byId = new Map(matches.map((m) => [m.id, m]));
  const gw = league.contests.length;
  const current = league.contests[gw - 1];
  const now = Date.now() / 1000;
  const open = !!current && Number(current.lockTime) > now;
  const hidden = !!current && current.sealed_ && !current.finalized;
  const allPlayed = !!current && current.fixtureIds.every((f) => FINISHED.has(byId.get(Number(f))?.status ?? ""));
  const upcoming = matches.filter((m) => m.kickoff > now + 600);
  const canSetGameweek = league.contests.length < league.gameweeks && (!league.contests.length || current.finalized);
  const seasonDone = league.contests.length === league.gameweeks && league.contests.every((c) => c.finalized);
  const needsCode = league.inviteCodeHash !== ZERO_HASH;
  const invite = typeof window !== "undefined" ? `${window.location.origin}/l/${leagueId}${code ? `?code=${code}` : ""}` : "";

  const myRank = season.findIndex((r) => isMe(r.member)) + 1;
  const myPts = season.find((r) => isMe(r.member))?.points ?? 0;
  const gwRank = gwRows ? gwRows.findIndex((r) => isMe(r.member)) + 1 : 0;
  const gwPts = gwRows?.find((r) => isMe(r.member))?.points ?? 0;
  const lastKickoff = current ? Math.max(0, ...current.fixtureIds.map((f) => byId.get(Number(f))?.kickoff ?? 0)) : 0;
  const revealDay = lastKickoff ? new Date(lastKickoff * 1000).toLocaleDateString(undefined, { weekday: "long" }) : "full time";
  const name = (a: string) => (isMe(a) ? "You" : agents.get(a.toLowerCase()) || fanName(a));

  async function share() {
    const c = await shareLink(league!.name, `Join my league "${league!.name}" on Terrace${code ? ` (code ${leagueCode(leagueId, code)})` : ""}.`, invite);
    if (c) flashCopied();
  }
  function flashCopied() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const board = (rows: Row[] | null, hide: boolean, unit: string) => (
    <ul className="board">
      {(rows ?? league.members.map((m) => ({ member: m, points: 0 }))).map((r, i) => (
        <li key={r.member} className={isMe(r.member) ? "me" : undefined}>
          <span className={`pos${!hide && i < 3 ? ` p${i + 1}` : ""}`}>{hide ? "–" : i + 1}</span>
          <Avatar seed={r.member} size={32} name={agents.get(r.member.toLowerCase()) || undefined} />
          <span className="name">
            {name(r.member)}
            {agents.has(r.member.toLowerCase()) && <span className="badge b-private" style={{ marginLeft: 6 }}>AI</span>}
            <div className="umeta">{season.find((s) => s.member === r.member)?.points ?? 0} pts this season</div>
          </span>
          {hide ? (
            <Badge tone="private" icon="lock">Hidden</Badge>
          ) : (
            <span className="pts">{r.points}<small>{unit}</small></span>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Header title={league.name} sub={gw ? `Gameweek ${gw} of ${league.gameweeks} · Season ${league.season}` : `Pre-season · ${league.gameweeks} gameweeks · ${league.season}`} back="/leagues" share={share} />

      {fresh && member && (
        <div className="sec">
          <div className="card greenish">
            <div className="eyebrow green">League created</div>
            <div className="uname" style={{ marginTop: 4 }}>Now bring your mates in.</div>
            {code && <div className="lg-code" style={{ marginTop: 6 }}>{leagueCode(leagueId, code)}</div>}
            <div className="umeta">{code ? "Share the link, or give them this code to type into Leagues → Join." : "Share the link; it's open to anyone."}</div>
          </div>
        </div>
      )}

      <div style={{ padding: "12px var(--gutter) 0" }}>
        <Seg
          sub
          value={tab}
          onChange={setTab}
          options={[
            { id: "table", label: "Table" },
            { id: "picks", label: "Picks" },
            { id: "run", label: league.governed ? "Votes" : "Gameweeks" },
            { id: "chat", label: "Chat" },
          ]}
        />
      </div>

      {error && <p className="error" style={{ padding: "10px var(--gutter) 0" }}>{error}</p>}

      {tab === "table" && (
        <>
          {status !== "ready" ? (
            <div className="pad"><SignIn reason="Sign in to join this league." /></div>
          ) : !member ? (
            <div className="sec">
              <div className="card">
                <div className="uname">Join {league.name}</div>
                <div className="umeta" style={{ marginBottom: 12 }}>
                  {league.members.length} of {league.maxMembers} in{league.entryFee > 0n ? ` · ${money(league.entryFee)} entry goes to the prize pool` : " · free to join"}
                </div>
                {needsCode && (
                  <label className="field" style={{ marginBottom: 10 }}>
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code from your mate" />
                  </label>
                )}
                <button className="cta" disabled={!!busy || league.members.length >= league.maxMembers} onClick={() => run("join", () => joinLeague(send, address!, id, code))}>
                  {league.members.length >= league.maxMembers ? "League is full" : busy === "join" ? "Joining…" : `Join league${league.entryFee > 0n ? ` · ${money(league.entryFee)}` : ""}`}
                </button>
              </div>
            </div>
          ) : null}

          <div className="sec">
            <div className="card violet lg-hero">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  {!current ? (
                    <>
                      <div className="eyebrow violet">Pre-season</div>
                      <div className="pts">No gameweek yet</div>
                      <div className="umeta">{league.governed ? "The group votes on the first gameweek's matches." : "The organiser picks the first gameweek's matches."}</div>
                    </>
                  ) : hidden ? (
                    <>
                      <div className="eyebrow violet">Gameweek {gw} · picks sealed</div>
                      <div className="pts">Hidden</div>
                      <div className="umeta">Picks stay hidden until the final whistle, then Chainlink reveals them. Nobody can copy.</div>
                    </>
                  ) : (
                    <>
                      <div className="eyebrow violet">Gameweek {gw} {current.finalized ? "revealed" : "· live"}</div>
                      <div className="pts">{member ? `${gwPts} pts` : `${gwRows?.[0]?.points ?? 0} pts top`}</div>
                      {member && gwRank > 0 && (
                        <div className="umeta">
                          {ordinal(gwRank)} of {league.members.length}
                          {gwRows && gwRows[0].points - gwPts > 0 ? ` · ${gwRows[0].points - gwPts} points off the top` : " · top of the gameweek"}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {league.isPrivate ? <Badge tone="sealed" icon="lock">Sealed</Badge> : league.governed ? <Badge tone="open">Member-run</Badge> : null}
              </div>
            </div>

            <div className="stats" style={{ marginTop: 10 }}>
              <div className="stat"><div className="v">{myPts}</div><div className="k">Season pts</div></div>
              <div className="stat"><div className="v green">{member && myRank ? ordinal(myRank) : "–"}</div><div className="k">Rank</div></div>
              {league.entryFee > 0n ? (
                <div className="stat"><div className="v amber">{money(league.prizePool)}</div><div className="k">Prize pool</div></div>
              ) : (
                <div className="stat"><div className="v blue">{league.members.length}/{league.maxMembers}</div><div className="k">Members</div></div>
              )}
            </div>

            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="cta cta-ghost cta-sm" onClick={share}><Icon name="share" size={16} /> Share invite</button>
              <button
                className="cta cta-ghost cta-sm"
                onClick={() => navigator.clipboard.writeText(invite).then(flashCopied).catch(() => {})}
              >
                <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            {code && member && <div className="umeta" style={{ textAlign: "center", marginTop: 8 }}>Invite code {leagueCode(leagueId, code)}</div>}
          </div>

          {league.ended && (
            <div className="sec">
              <div className="card greenish row">
                <Icon name="crown" size={26} />
                <div>
                  <div className="eyebrow green">Champion</div>
                  <div className="uname">{season[0] ? name(season[0].member) : "–"} · {season[0]?.points ?? 0} pts</div>
                </div>
              </div>
            </div>
          )}

          {current && (
            <div className="sec">
              <div className="sec-hd">
                <h3>Gameweek {gw}</h3>
                <span style={{ marginLeft: "auto" }}>
                  {hidden ? <Badge tone="sealed" icon="lock">Hidden until {revealDay}</Badge> : current.finalized ? <Badge tone="settled">Final</Badge> : <Badge tone="open">Live</Badge>}
                </span>
              </div>
              {board(gwRows, hidden, "GW pts")}
              {!current.finalized && allPlayed && (
                <button className="cta cta-sm" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => run("final", () => finalizeGameweek(send, league.contestIds[gw - 1]))}>
                  {busy === "final" ? "Adding up…" : "Add up the gameweek"}
                </button>
              )}
            </div>
          )}

          {prevRows && (
            <div className="sec">
              <div className="sec-hd"><h3>Gameweek {gw - 1}</h3><Badge tone="settled">Revealed</Badge></div>
              {board(prevRows, false, "GW pts")}
            </div>
          )}

          <div className="sec">
            <div className="sec-hd"><h3>Season table</h3></div>
            {board(season, false, "pts")}
            {seasonDone && !league.ended && (
              <button className="cta" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => run("end", () => endSeason(send, id))}>
                <Icon name="crown" size={18} /> {busy === "end" ? "Crowning…" : "Crown the champion"}
              </button>
            )}
          </div>
        </>
      )}

      {tab === "picks" && (
        <div className="sec">
          {!current ? (
            <Empty title="No gameweek yet">{league.governed ? "Suggest the matches in Votes." : creator ? "Pick the matches in Gameweeks." : "Waiting for the organiser to pick the matches."}</Empty>
          ) : (
            <>
              <div className="sec-hd">
                <h3>Gameweek {gw} picks</h3>
                <span style={{ marginLeft: "auto" }}>
                  {entered ? <Badge tone="won" icon="check">{current.sealed_ ? "Sealed in" : "Picks in"}</Badge> : open ? <Badge tone="flash" icon="clock">Locks at kick-off</Badge> : <Badge tone="settled">Locked</Badge>}
                </span>
              </div>
              <div className="umeta" style={{ marginTop: -4, marginBottom: 10 }}>
                Exact score 3 pts, right result 1 pt.{current.sealed_ ? " Picks stay hidden until the final whistle, then Chainlink reveals them, so nobody can copy." : ""}
              </div>
              {current.fixtureIds.map((f) => {
                const m = byId.get(Number(f));
                const key = f.toString();
                const [h, a] = picks[key] ?? [1, 1];
                const started = m && m.goals.home !== null;
                return (
                  <div key={key} className="card lg-fixture">
                    <div className="side"><Crest logo={m?.home.logo} name={m?.home.name ?? "Home"} /><span>{m?.home.name ?? `Match ${key}`}</span></div>
                    {open && member ? (
                      <ScorePicker home={h} away={a} homeTeam={m?.home.name ?? ""} awayTeam={m?.away.name ?? ""} onChange={(nh, na) => setPicks({ ...picks, [key]: [nh, na] })} />
                    ) : (
                      <div className="res">
                        {started ? `${m!.goals.home}–${m!.goals.away}` : "v"}
                        <small>{m ? (FINISHED.has(m.status) ? "Full time" : started ? "In play" : new Date(m.kickoff * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })) : ""}</small>
                      </div>
                    )}
                    <div className="side"><Crest logo={m?.away.logo} name={m?.away.name ?? "Away"} /><span>{m?.away.name ?? ""}</span></div>
                  </div>
                );
              })}
              {open && member && keys && (
                <button
                  className={`cta${current.sealed_ ? " cta-violet" : ""}`}
                  style={{ marginTop: 12 }}
                  disabled={!!busy}
                  onClick={() =>
                    run("picks", () =>
                      submitPicks(
                        send, keys, league.contestIds[gw - 1], current.sealed_,
                        current.fixtureIds.map((f) => (picks[f.toString()] ?? [1, 1])[0]),
                        current.fixtureIds.map((f) => (picks[f.toString()] ?? [1, 1])[1]),
                      ),
                    )
                  }
                >
                  <Icon name={current.sealed_ ? "lock" : "check"} size={18} />
                  {busy === "picks" ? "Locking in…" : current.sealed_ ? (entered ? "Re-seal my picks" : "Seal my picks") : entered ? "Update my picks" : "Lock in my picks"}
                </button>
              )}
              {open && !member && status === "ready" && <div className="umeta" style={{ marginTop: 10 }}>Join the league on the Table tab to make picks.</div>}
              {status !== "ready" && <SignIn reason="Sign in to make your picks." />}
              {!open && !current.finalized && (
                <div className="umeta" style={{ marginTop: 10 }}>{allPlayed ? "All played. Add up the gameweek on the Table tab." : "Picks are locked. Points land as the matches finish."}</div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "run" && (
        <div className="sec">
          {member && canSetGameweek && (
            <>
              <div className="sec-hd"><h3>{league.governed ? "Vote on next gameweek's matches" : creator ? "Pick next gameweek's matches" : "Next gameweek"}</h3></div>
              {league.governed || creator ? (
                <>
                  {upcoming.length === 0 && <div className="umeta">No upcoming matches scheduled yet.</div>}
                  {upcoming.map((m) => {
                    const on = nextGw.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="card card-tap row"
                        style={{ width: "100%", textAlign: "left", ...(on ? { borderColor: "var(--green)", background: "var(--green-tint)" } : {}) }}
                        onClick={() => setNextGw(on ? nextGw.filter((x) => x !== m.id) : [...nextGw, m.id])}
                      >
                        <span className="crest-pair"><Crest logo={m.home.logo} name={m.home.name} /><Crest logo={m.away.logo} name={m.away.name} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="uname">{m.home.name} v {m.away.name}</div>
                          <div className="umeta">{new Date(m.kickoff * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <span style={{ color: on ? "var(--green)" : "var(--ink-4)" }}><Icon name={on ? "check" : "plus"} size={18} /></span>
                      </button>
                    );
                  })}
                  <button
                    className="cta"
                    style={{ marginTop: 12 }}
                    disabled={!!busy || nextGw.length === 0}
                    onClick={() => run("gw", () => (league.governed ? proposeGameweek(send, id, nextGw.map(BigInt)) : addGameweek(send, id, nextGw.map(BigInt))))}
                  >
                    {busy === "gw" ? "Sending…" : league.governed ? `Ask the group: ${nextGw.length} matches` : `Set ${nextGw.length} matches`}
                  </button>
                </>
              ) : (
                <div className="umeta">Waiting for the organiser to set it.</div>
              )}
            </>
          )}
          {member && !canSetGameweek && !seasonDone && <div className="umeta" style={{ marginBottom: 12 }}>The next gameweek can be set once gameweek {gw} is added up.</div>}

          {league.governed ? (
            <>
              <div className="sec-hd" style={{ marginTop: 16 }}><h3>Group votes</h3></div>
              {proposals.length === 0 && <div className="umeta">No votes yet. Anyone in the league can suggest the next gameweek's matches or a take to feature; the group decides.</div>}
              {proposals.map((p) => {
                const openVote = p.status === 0 && Number(p.deadline) > now;
                const total = p.yes + p.no;
                return (
                  <div key={p.id} className="card lg-vote">
                    <div className="row" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div className="uname">{p.kind === 0 ? "Next gameweek's matches" : "Feature a take"}</div>
                        <div className="umeta">Suggested by {name(p.proposer)}{openVote ? ` · closes ${new Date(Number(p.deadline) * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</div>
                      </div>
                      <Badge tone={p.status === 1 ? "won" : p.status === 0 ? "open" : "lost"}>{openVote ? "Voting" : ["Ready to close", "Passed", "Rejected", "Couldn't run"][p.status]}</Badge>
                    </div>
                    <div className="bar">
                      <i style={{ width: total ? `${(p.yes / total) * 100}%` : "0%" }} />
                      <b style={{ width: total ? `${(p.no / total) * 100}%` : "0%" }} />
                    </div>
                    <div className="pool-labels"><span className="y">{p.yes} for</span><span className="n">{p.no} against</span></div>
                    {member && openVote && (
                      <div className="oddsrow two" style={{ marginTop: 10 }}>
                        <button className="odd odd-yes sm" disabled={!!busy} onClick={() => run(`v${p.id}`, () => vote(send, BigInt(p.id), true))}><span className="lbl">Vote</span><span className="val">For</span></button>
                        <button className="odd odd-no sm" disabled={!!busy} onClick={() => run(`v${p.id}`, () => vote(send, BigInt(p.id), false))}><span className="lbl">Vote</span><span className="val">Against</span></button>
                      </div>
                    )}
                    {p.status === 0 && !openVote && (
                      <button className="cta cta-ghost cta-sm" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => run(`x${p.id}`, () => executeProposal(send, BigInt(p.id)))}>
                        {busy === `x${p.id}` ? "Closing…" : "Close the vote"}
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="umeta" style={{ marginTop: 12 }}>Run by {creator ? "you" : fanName(league.creator)}. {league.contests.length} of {league.gameweeks} gameweeks set.</div>
          )}
          {!member && <div className="umeta" style={{ marginTop: 12 }}>Join the league to have your say.</div>}
        </div>
      )}

      {tab === "chat" && (
        <div className="sec">
          <Room kind={1} roomId={leagueId} canPost={member} />
        </div>
      )}
    </>
  );
}
