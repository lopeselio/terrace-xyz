"use client";
import { Seg, Switch } from "./ui";
import type { Rules } from "@/lib/leagues";

/*
 * A league's house rules: how many points picks and featured takes score, jokers, sealed picks
 * and, in member-run leagues, how votes work. The same editor sets them when the league is made
 * and changes them later (the organiser directly, or a vote in a member-run league).
 */

const EXACT = [2, 3, 5] as const;
const RESULT = [0, 1, 2] as const;
const FEATURED = [2, 3, 5] as const;
const PERIODS = [
  { s: 6 * 3600, label: "6 hours" },
  { s: 86_400, label: "1 day" },
  { s: 3 * 86_400, label: "3 days" },
] as const;
const QUORUMS = [25, 33, 50] as const;

const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;
const period = (s: number) => PERIODS.find((p) => p.s === s)?.label ?? (s % 86_400 === 0 ? `${s / 86_400} days` : `${Math.round(s / 3600)} hours`);

/** Pick the closest option, so rules set elsewhere still show a selected chip. */
const near = <T extends number>(opts: readonly T[], v: number) => opts.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export function RulesEditor({ rules, onChange, governed, isPrivate }: { rules: Rules; onChange: (r: Rules) => void; governed: boolean; isPrivate: boolean }) {
  const set = (patch: Partial<Rules>) => {
    const next = { ...rules, ...patch };
    if (next.resultPoints > next.exactPoints) next.resultPoints = next.exactPoints; // the result can't beat the exact score
    onChange(next);
  };
  const seg = <T extends number>(opts: readonly T[], v: number, key: keyof Rules, label: (o: T) => string) => (
    <Seg sub value={String(near(opts, v))} onChange={(x) => set({ [key]: Number(x) } as Partial<Rules>)} options={opts.map((o) => ({ id: String(o), label: label(o) }))} />
  );

  return (
    <div className="hr-edit">
      <div className="flabel">Exact score</div>
      {seg(EXACT, rules.exactPoints, "exactPoints", pts)}
      <div className="flabel" style={{ marginTop: 14 }}>Right result</div>
      {seg(RESULT, rules.resultPoints, "resultPoints", (o) => (o === 0 ? "Nothing" : pts(o)))}
      <div className="flabel" style={{ marginTop: 14 }}>Featured take</div>
      {seg(FEATURED, rules.featuredPoints, "featuredPoints", pts)}
      <div className="umeta" style={{ marginTop: 6 }}>A take the league picks out. Backing the right side scores this instead of 1.</div>

      <div className="card" style={{ padding: "4px 14px", marginTop: 14 }}>
        <div className="kv">
          <div>
            <div className="v">Jokers</div>
            <div className="umeta">Everyone gets one per season to double a gameweek. Play it before kick-off.</div>
          </div>
          <Switch on={rules.jokers} onChange={(v) => set({ jokers: v })} label="Jokers" />
        </div>
        {!isPrivate && (
          <div className="kv" style={{ borderTop: "1px solid var(--line)" }}>
            <div>
              <div className="v">Sealed picks</div>
              <div className="umeta">Nobody sees anyone&apos;s picks until kick-off, so nobody can copy.</div>
            </div>
            <Switch on={rules.sealedPicks} onChange={(v) => set({ sealedPicks: v })} label="Sealed picks" />
          </div>
        )}
      </div>

      {governed && (
        <>
          <div className="flabel" style={{ marginTop: 14 }}>Votes stay open</div>
          <Seg sub value={String(near(PERIODS.map((p) => p.s), rules.votingPeriod))} onChange={(x) => set({ votingPeriod: Number(x) })} options={PERIODS.map((p) => ({ id: String(p.s), label: p.label }))} />
          <div className="flabel" style={{ marginTop: 14 }}>To count, at least</div>
          {seg(QUORUMS, rules.quorumPct, "quorumPct", (o) => `${o}% vote`)}
          <div className="umeta" style={{ marginTop: 6 }}>A vote passes the moment over half the league says yes. Otherwise, when it closes, more yes than no wins if enough members voted.</div>
        </>
      )}
    </div>
  );
}

/** The rules in plain words, one line each. */
export function rulesLines(r: Rules, o: { governed: boolean; isPrivate: boolean }): string[] {
  return [
    `Exact score ${pts(r.exactPoints)}, right result ${r.resultPoints ? pts(r.resultPoints) : "nothing"}`,
    `Featured takes ${pts(r.featuredPoints)}`,
    r.jokers ? "Jokers on: double one gameweek a season" : "No jokers",
    o.isPrivate ? "Picks sealed until the gameweek ends" : r.sealedPicks ? "Picks sealed until kick-off" : "Picks visible to everyone",
    ...(o.governed ? [`Votes stay open ${period(r.votingPeriod)}, ${r.quorumPct}% must vote`] : []),
  ];
}

/** What a rule change changes, for a vote card: "Exact score 3 → 5 pts". */
export function rulesDiff(from: Rules, to: Rules, o: { governed: boolean; isPrivate: boolean }): string[] {
  const out: string[] = [];
  if (from.exactPoints !== to.exactPoints) out.push(`Exact score ${from.exactPoints} → ${pts(to.exactPoints)}`);
  if (from.resultPoints !== to.resultPoints) out.push(`Right result ${from.resultPoints} → ${pts(to.resultPoints)}`);
  if (from.featuredPoints !== to.featuredPoints) out.push(`Featured takes ${from.featuredPoints} → ${pts(to.featuredPoints)}`);
  if (from.jokers !== to.jokers) out.push(to.jokers ? "Jokers on" : "Jokers off");
  if (!o.isPrivate && from.sealedPicks !== to.sealedPicks) out.push(to.sealedPicks ? "Seal picks until kick-off" : "Show picks to everyone");
  if (o.governed && from.votingPeriod !== to.votingPeriod) out.push(`Votes stay open ${period(to.votingPeriod)}`);
  if (o.governed && from.quorumPct !== to.quorumPct) out.push(`${to.quorumPct}% must vote`);
  return out.length ? out : ["No change"];
}

export function RulesSummary({ rules, governed, isPrivate }: { rules: Rules; governed: boolean; isPrivate: boolean }) {
  return (
    <ul className="hr-list">
      {rulesLines(rules, { governed, isPrivate }).map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
