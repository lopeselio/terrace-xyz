"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignIn } from "./SignIn";
import { Avatar, Badge, fanName, usd } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { questionLabel } from "@/lib/labels";
import { useMatches } from "@/lib/useMatches";

type Row = { id: string; challenger: string; opponent: string | null; stake: string; status: number; winner: string | null; question: { kind: number; line: number; text: string; fixture: { id: string } | null } };
const FIELDS = "id challenger opponent stake status winner question { kind line text fixture { id } }";

export function ChallengeList() {
  const { status, address } = useAccount();
  const matches = useMatches();
  const [mine, setMine] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row[]>([]);

  useEffect(() => {
    const me = address?.toLowerCase() ?? "";
    query<{ mine: Row[]; open: Row[] }>(
      `query L($me: String!) {
        mine: Matchup(where: { _or: [{ challenger: { _eq: $me } }, { opponent: { _eq: $me } }] }, order_by: { createdAt: desc }) { ${FIELDS} }
        open: Matchup(where: { status: { _eq: 0 }, opponent: { _is_null: true }, challenger: { _neq: $me } }, order_by: { createdAt: desc }, limit: 20) { ${FIELDS} }
      }`,
      { me },
    ).then((d) => { setMine(d.mine); setOpen(d.open); }).catch(() => {});
  }, [address]);

  const row = (r: Row) => {
    const match = r.question.fixture ? matches.get(Number(r.question.fixture.id)) : undefined;
    const me = address?.toLowerCase();
    const other = r.challenger === me ? r.opponent : r.challenger;
    const tone = r.status === 4 ? (r.winner === me ? "won" : "lost") : r.status === 1 ? "open" : r.status === 0 ? "amber" : "settled";
    const text = r.status === 4 ? (r.winner === me ? "WON" : "LOST") : ["OPEN", "ON", "OFF", "EXPIRED", "", "VOID"][r.status];
    return (
      <li key={r.id} className="take">
        <Link href={`/c/${r.id}`}>
          <div className="take-head">
            <Avatar seed={other ?? r.challenger} />
            <div><div className="who">{other ? fanName(other) : "Open to anyone"}</div><div className="when">{usd(r.stake)} each</div></div>
            <div className="badges"><Badge tone={tone}>{text}</Badge></div>
          </div>
          <p className="take-text">{questionLabel(r.question, match)}</p>
        </Link>
      </li>
    );
  };

  return (
    <>
      {status !== "ready" ? <SignIn reason="Sign in to see your challenges." /> : (
        <>
          <div className="section-head"><h3>Yours</h3></div>
          <ul className="feed">{mine.length ? mine.map(row) : <li className="muted">None yet. Open a match and challenge a mate on a result or a take.</li>}</ul>
        </>
      )}
      <div className="section-head"><h3>Open challenges</h3></div>
      <ul className="feed">{open.length ? open.map(row) : <li className="muted">No open challenges right now.</li>}</ul>
    </>
  );
}
