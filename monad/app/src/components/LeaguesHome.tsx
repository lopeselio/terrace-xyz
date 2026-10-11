"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateLeague } from "./CreateLeague";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Badge, Empty, Seg, SkeletonCards, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { ordinal, parseInvite } from "@/lib/leagues";
import "@/styles/leagues.css";

export type OpenLeague = { id: string; name: string; memberCount: number; gameweeks: number; isPrivate: boolean; entryFee: string };
type Mine = {
  seasonScore: number;
  league: OpenLeague & {
    contests: { gameweek: number | null; isSealed: boolean; finalized: boolean }[];
    members: { member: string; seasonScore: number }[];
  };
};
type Tab = "mine" | "create" | "join";

/** Leagues (screens 11, 19, 20): Mine · Create · Join. */
export function LeaguesHome({ open, tab: initial }: { open: OpenLeague[]; tab: Tab }) {
  const { status, address } = useAccount();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initial);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return setMine(null);
    query<{ LeagueMember: Mine[] }>(
      `query M($me: String!) { LeagueMember(where: { member: { _eq: $me } }, order_by: { joinedAt: desc }) {
        seasonScore
        league { id name memberCount gameweeks isPrivate entryFee
          contests(order_by: { gameweek: desc }, limit: 1) { gameweek isSealed finalized }
          members(order_by: { seasonScore: desc }) { member seasonScore } } } }`,
      { me: address.toLowerCase() },
    )
      .then((d) => setMine(d.LeagueMember))
      .catch(() => setMine([]));
  }, [address]);

  const go = (t: Tab) => {
    setTab(t);
    router.replace(t === "mine" ? "/leagues" : `/leagues?tab=${t}`, { scroll: false });
  };

  const me = address?.toLowerCase();
  const ranked = (mine ?? []).map((m) => {
    const rank = m.league.members.findIndex((x) => x.member === me) + 1 || m.league.members.length;
    return { ...m, rank, offTop: (m.league.members[0]?.seasonScore ?? 0) - m.seasonScore };
  });
  const best = [...ranked].sort((a, b) => a.rank / a.league.memberCount - b.rank / b.league.memberCount)[0];
  const joinable = open.filter((l) => !l.isPrivate && !(mine ?? []).some((m) => m.league.id === l.id));

  function join() {
    const p = parseInvite(invite);
    if (!p) return setInviteError("That doesn't look like an invite. Paste the link or the code, like L12-ABCD.");
    router.push(`/l/${p.leagueId}${p.code ? `?code=${p.code}` : ""}`);
  }

  return (
    <>
      <Header title="Leagues" sub="Season 2026 · Premier League" back="/me" />
      <div style={{ padding: "12px var(--gutter) 6px" }}>
        <Seg value={tab} onChange={go} options={[{ id: "mine", label: "Mine" }, { id: "create", label: "Create" }, { id: "join", label: "Join" }]} />
      </div>

      {tab === "mine" && (
        <div className="sec" style={{ paddingTop: 4 }}>
          {status !== "ready" ? (
            <SignIn reason="Start a league with your group chat, or see where you rank." />
          ) : mine === null ? (
            <SkeletonCards n={2} />
          ) : (
            <>
              {best && (
                <Link href={`/l/${best.league.id}`} className="card greenish card-tap">
                  <div className="row">
                    <div style={{ flex: 1 }}>
                      <div className="eyebrow green">Your rank</div>
                      <div className="lg-big">{ordinal(best.rank)} <small>of {best.league.memberCount}</small></div>
                      <div className="umeta">
                        {best.league.name} · {best.offTop > 0 ? `${best.offTop} points off top` : best.rank === 1 ? "top of the table" : "level on points"}
                      </div>
                    </div>
                    <Icon name="crown" size={26} />
                  </div>
                </Link>
              )}
              <div className="sec-hd" style={{ marginTop: 16 }}>
                <h3>Your leagues</h3>
                <button className="more" onClick={() => go("create")}>New <Icon name="plus" size={14} /></button>
              </div>
              {ranked.length === 0 && (
                <Empty title="No leagues yet" action={<button className="btn-out" onClick={() => go("create")}><Icon name="plus" size={14} /> Start a league</button>}>
                  Start a league with your group chat. One link, one table, bragging rights all season.
                </Empty>
              )}
              {ranked.map((m) => {
                const last = m.league.contests[0];
                return (
                  <Link key={m.league.id} href={`/l/${m.league.id}`} className="card card-tap lg-card">
                    <div className="row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="lg-name">{m.league.name}</div>
                        <div className="umeta">GW {last?.gameweek ?? 0} of {m.league.gameweeks} · {m.league.memberCount} members</div>
                      </div>
                      {m.league.isPrivate ? <Badge tone="sealed" icon="lock">Sealed</Badge> : <Badge tone="open">Open</Badge>}
                    </div>
                    <div className="stats">
                      <div className="stat"><div className="v green">{m.seasonScore}</div><div className="k">Season pts</div></div>
                      <div className="stat"><div className="v">{ordinal(m.rank)}</div><div className="k">Rank</div></div>
                      <div className="stat"><div className="v blue">GW{last?.gameweek ?? 0}</div><div className="k">{last && !last.finalized ? (last.isSealed ? "Picks sealed" : "In play") : "Gameweek"}</div></div>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
          {joinable.length > 0 && <OpenList leagues={joinable} />}
        </div>
      )}

      {tab === "create" && <CreateLeague />}

      {tab === "join" && (
        <div className="sec" style={{ paddingTop: 4 }}>
          <div className="flabel">Invite code</div>
          <label className="field">
            <input value={invite} onChange={(e) => { setInvite(e.target.value); setInviteError(null); }} placeholder="e.g. L12-ABCD, or paste the link" autoCapitalize="characters" />
          </label>
          {inviteError && <p className="error" style={{ marginTop: 6 }}>{inviteError}</p>}
          <button className="cta" style={{ marginTop: 12 }} disabled={!invite.trim()} onClick={join}>Join league</button>
          <OpenList leagues={joinable} />
        </div>
      )}
    </>
  );
}

function OpenList({ leagues }: { leagues: OpenLeague[] }) {
  return (
    <>
      <div className="sec-hd" style={{ marginTop: 20 }}><h3>Open to join</h3></div>
      {leagues.length === 0 ? (
        <div className="umeta">No open leagues right now. Start one and share the link.</div>
      ) : (
        <div className="card" style={{ padding: "0 14px" }}>
          <div className="rowlist">
            {leagues.map((l) => (
              <Link key={l.id} href={`/l/${l.id}`} className="listrow">
                <span className="crest" style={{ background: "var(--raised)", color: "var(--amber-ink)" }}><Icon name="trophy" size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="uname">{l.name}</div>
                  <div className="umeta">{l.memberCount} members · {l.gameweeks} gameweeks</div>
                </div>
                <span className="badge b-settled">{Number(l.entryFee) ? `${usd(l.entryFee)} entry` : "Free"}</span>
                <Icon name="chevronRight" size={16} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
