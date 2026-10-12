"use client";
import { RUNS } from "./CreateLeague";
import { Countdown } from "./Countdown";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Badge, Sheet, SheetHead, money } from "./ui";
import { useAccount } from "@/lib/account";
import "@/styles/leagues.css";

/*
 * Opened from an invite link: what this league is before you're in it. Who runs it, how private
 * it is, how long, what it costs and what's due next, then Join or Not now.
 */
export function LeagueInvite({
  name, organiser, governed, isPrivate, members, maxMembers, gameweeks, gw, entryFee, next, busy, error, onJoin, onClose,
}: {
  name: string;
  organiser: string;
  governed: boolean;
  isPrivate: boolean;
  members: number;
  maxMembers: number;
  gameweeks: number;
  gw: number;
  entryFee: bigint;
  next?: { label: string; to: number };
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onClose: () => void;
}) {
  const { status } = useAccount();
  const run = RUNS.find((r) => r.id === (governed ? "members" : "me"))!;
  const full = members >= maxMembers;

  return (
    <Sheet onClose={onClose}>
      <SheetHead eyebrow={`${organiser} invited you`} title={name} onClose={onClose} />

      <div className="invite-facts">
        <span><b>{members}</b>/{maxMembers} fans</span>
        <span><b>{gameweeks}</b> gameweeks{gw ? ` · on GW ${gw}` : " · not started"}</span>
        <span><b>{entryFee > 0n ? money(entryFee) : "Free"}</b>{entryFee > 0n ? " to enter" : " to join"}</span>
      </div>

      <div className="flabel" style={{ marginTop: 16 }}>Who runs it</div>
      <div className="run-choice on" style={{ cursor: "default" }}>
        <span className="run-icon"><Icon name={run.icon} size={18} /></span>
        <span className="run-body">
          <span className="run-title">{run.title === "I do" ? `${organiser} does` : run.title}</span>
          <span className="run-lede">{run.id === "me" ? "The organiser picks each gameweek's matches." : run.lede}</span>
          <ul>{(run.id === "me" ? ["Matches open for picks as soon as they're set", "You make your picks and chat"] : run.points.slice(0, 2)).map((p) => <li key={p}>{p}</li>)}</ul>
        </span>
      </div>

      <div className="card invite-row">
        <Icon name="lock" size={16} />
        <div style={{ flex: 1 }}>
          <div className="uname">{isPrivate ? "Private and sealed" : "Open league"}</div>
          <div className="umeta">
            {isPrivate ? "Invite only. Picks stay hidden until the final whistle, then Chainlink reveals them, so nobody can copy." : "Anyone can join, and picks are visible."}
          </div>
        </div>
        {isPrivate && <Badge tone="sealed" icon="lock">Sealed</Badge>}
      </div>

      <div className="card invite-row">
        <Icon name="trophy" size={16} />
        <div style={{ flex: 1 }}>
          <div className="uname">How you score</div>
          <div className="umeta">Exact score 3 pts, right result 1. Market wins on the gameweek&apos;s matches add to the table too.</div>
        </div>
      </div>

      {next && (
        <div className="card invite-row soon">
          <Icon name="clock" size={16} />
          <div style={{ flex: 1 }} className="uname">{next.label}</div>
          <Countdown to={next.to} />
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {status !== "ready" ? (
          <SignIn bare reason="Sign in to join. It takes one passkey, no password." />
        ) : (
          <button className="cta" disabled={busy || full} onClick={onJoin}>
            {full ? "League is full" : busy ? "Joining…" : `Join ${name}${entryFee > 0n ? ` · ${money(entryFee)}` : ""}`}
          </button>
        )}
        <button className="cta cta-ghost" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}
