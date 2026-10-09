"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fixtureMeta } from "@/lib/fixtures";
import { getRecentContests, kickoffLabel, type Contest } from "@/lib/terrace";

export default function Home() {
  const [contests, setContests] = useState<Contest[] | null>(null);

  useEffect(() => {
    getRecentContests(10).then(setContests).catch(() => setContests([]));
  }, []);

  return (
    <>
      <h1>Call the score before kickoff.</h1>
      <p className="lede">Pick scorelines, challenge your mates, and build a record that's yours. Free to play.</p>
      <Link href="/new" className="cta">Start a challenge</Link>

      <h2>Open challenges</h2>
      {contests === null && <p className="muted">Loading challenges…</p>}
      {contests?.length === 0 && <p className="muted">Nothing open yet. Start the first one.</p>}
      {contests?.map((c) => {
        const first = fixtureMeta(c.fixtureIds[0]);
        const open = c.lockTime * 1000 > Date.now();
        return (
          <Link key={c.id.toString()} href={`/c/${c.id}`} className="plain-card" style={{ display: "block", marginBottom: 10, textDecoration: "none" }}>
            <strong>{first.home} v {first.away}</strong>
            {c.fixtureIds.length > 1 && <span className="muted"> and {c.fixtureIds.length - 1} more</span>}
            <div className="muted">
              {c.entrants.length} in · {open ? `picks close ${kickoffLabel(c.lockTime)}` : c.finalized ? "settled" : "in play"}
            </div>
          </Link>
        );
      })}
    </>
  );
}
