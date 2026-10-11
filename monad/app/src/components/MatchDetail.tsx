"use client";
import { useEffect, useState } from "react";
import { Header, shareLink } from "./Header";
import { MatchMarkets } from "./MatchMarkets";
import { Room } from "./Room";
import { Badge, Crest, Seg } from "./ui";
import "@/styles/match.css";

export type DetailMatch = {
  id: number;
  kickoff: number;
  status: string;
  elapsed: number | null;
  league: string;
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  goals: { home: number | null; away: number | null };
};
type Tab = "result" | "goals" | "takes" | "chat";

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const DONE = new Set(["FT", "AET", "PEN"]);

/** Match detail from the handoff: score hero, then Match result · Goals · Takes · Chat. */
export function MatchDetail({ m }: { m: DetailMatch }) {
  const live = LIVE.has(m.status);
  const done = DONE.has(m.status);
  const started = m.goals.home !== null || live || done;
  const open = !started && m.kickoff * 1000 > Date.now();
  const [tab, setTab] = useState<Tab>(open ? "result" : "takes");
  const [copied, setCopied] = useState(false);

  // Deep links into the room (#take-12, #compose) open the chat.
  useEffect(() => {
    const h = window.location.hash;
    if (h === "#compose") setTab("chat");
    else if (h.startsWith("#take-")) setTab("takes");
  }, []);

  const label = `${m.home.name} v ${m.away.name}`;
  const kick = new Date(m.kickoff * 1000);

  return (
    <>
      <Header
        title="Match"
        sub={m.league}
        back="/markets"
        share={async () => setCopied(await shareLink(label, `${label} on Terrace: back your take.`))}
      />
      <div className="sec" style={{ paddingTop: 14 }}>
        <div className="card match-hero">
          <div className="row" style={{ justifyContent: "center", gap: 18, alignItems: "flex-start" }}>
            <div className="mh-team">
              <Crest lg logo={m.home.logo} name={m.home.name} />
              <div className="umeta">{m.home.name}</div>
            </div>
            <div className="mh-mid">
              {live ? (
                <Badge tone="live">{m.status === "HT" ? "HT" : `${m.elapsed ?? ""}'`}</Badge>
              ) : done ? (
                <Badge tone="settled">Full time</Badge>
              ) : (
                <Badge tone="open">{kick.toLocaleDateString(undefined, { weekday: "short" })} {kick.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</Badge>
              )}
              <div className="mh-score">{started ? `${m.goals.home ?? 0} – ${m.goals.away ?? 0}` : "v"}</div>
            </div>
            <div className="mh-team">
              <Crest lg logo={m.away.logo} name={m.away.name} />
              <div className="umeta">{m.away.name}</div>
            </div>
          </div>
          <div className="match-lg" style={{ textAlign: "center", marginTop: 12 }}>
            {m.league} · {copied ? "Link copied" : "Settled by Chainlink"}
          </div>
        </div>
      </div>

      <div style={{ padding: "14px var(--gutter) 0" }}>
        <Seg
          sub
          value={tab}
          onChange={setTab}
          options={[
            { id: "result", label: "Match result" },
            { id: "goals", label: "Goals" },
            { id: "takes", label: "Takes" },
            { id: "chat", label: "Chat" },
          ]}
        />
      </div>

      {(tab === "result" || tab === "goals") && <MatchMarkets m={m} view={tab} open={open} />}
      {tab === "takes" && (
        <div className="sec">
          <Room kind={0} roomId={m.id} fixtureId={m.id} view="markets" matchLabel={label} onSayTake={() => setTab("chat")} />
        </div>
      )}
      {tab === "chat" && (
        <div className="sec">
          <Room kind={0} roomId={m.id} fixtureId={m.id} matchLabel={label} />
        </div>
      )}
      <div style={{ height: 70 }} />
    </>
  );
}
