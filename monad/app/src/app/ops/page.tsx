import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStats } from "@/lib/server/stats";
import { getTxCount } from "@/lib/server/txcount";
import { fanName } from "@/lib/names";
import { TxCounter } from "@/components/TxCounter";
import "@/styles/ops.css";

/*
 * Private stats for the team. Not linked anywhere, not indexed, and a 404 unless the URL carries
 * ?key=<OPS_KEY> (set in Vercel and app/.env.local). Everything comes from the Envio index.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terrace · Ops", robots: { index: false, follow: false } };

const RANGES = [7, 14, 30];

const n = (v: number) => v.toLocaleString("en-GB");
const usd = (v: number) => `$${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ago = (ts: number | null, now: number) => {
  if (!ts) return "–";
  const s = now - ts;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const pct = (v: number, of: number) => (of ? `${Math.round((v / of) * 100)}%` : "–");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const KIND: Record<string, string> = {
  TAKE: "posted a take", TAKE_LISTED: "made a take a market", BET: "bet", WIN: "won", CHALLENGE: "sent a 1v1",
  CHALLENGE_WON: "won a 1v1", TITLE: "won a league", LEAGUE_JOIN: "joined a league", PROPOSAL: "proposed", RULES: "changed house rules", AGENT: "registered as an agent",
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ops-tile">
      <div className="ops-tile-label">{label}</div>
      <div className="ops-tile-value">{value}</div>
      {sub && <div className="ops-tile-sub">{sub}</div>}
    </div>
  );
}

/** One series, one hue: bars on a baseline, native tooltips per day, a few date ticks. */
function Bars({ title, rows, value, fmt }: { title: string; rows: { label: string }[]; value: (i: number) => number; fmt: (v: number) => string }) {
  const W = 560, H = 190, top = 24, bottom = 30, left = 4;
  const vals = rows.map((_, i) => value(i));
  const max = Math.max(1, ...vals);
  const step = (W - left) / rows.length;
  const bw = Math.max(3, Math.min(26, step - 3));
  const total = vals.reduce((s, v) => s + v, 0);
  const every = Math.ceil(rows.length / 5);
  return (
    <figure className="ops-card ops-chart">
      <figcaption>
        <span>{title}</span>
        <b>{fmt(total)}</b>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${fmt(total)} over ${rows.length} days`}>
        <line x1={left} x2={W} y1={H - bottom} y2={H - bottom} className="ops-axis" />
        <line x1={left} x2={W} y1={top} y2={top} className="ops-grid" />
        <text x={W} y={top - 6} textAnchor="end" className="ops-tick">{fmt(max)}</text>
        {vals.map((v, i) => {
          const h = (v / max) * (H - top - bottom);
          const x = left + i * step + (step - bw) / 2;
          return (
            <g key={i}>
              <rect x={left + i * step} y={top} width={step} height={H - top - bottom} className="ops-hit">
                <title>{`${rows[i].label}: ${fmt(v)}`}</title>
              </rect>
              {v > 0 && <path className="ops-bar" d={`M${x},${H - bottom} V${H - bottom - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, h)},-${Math.min(4, h)} H${x + bw - Math.min(4, h)} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} V${H - bottom} Z`} />}
              {i % every === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="ops-tick">{rows[i].label}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export default async function Ops({ searchParams }: { searchParams: Promise<{ key?: string; days?: string }> }) {
  const { key, days: d } = await searchParams;
  if (!process.env.OPS_KEY || key !== process.env.OPS_KEY) notFound();
  const days = RANGES.includes(Number(d)) ? Number(d) : 14;
  let s;
  const txs = getTxCount().catch(() => null); // HyperSync, in parallel with the indexer
  try {
    s = await getStats(days);
  } catch (e) {
    return <div className="ops"><p className="ops-error">Couldn&apos;t reach the indexer: {(e as Error).message}. Refresh in a minute.</p></div>;
  }
  const { fans, money, social } = s;
  const mixMax = Math.max(1, ...s.mix.map(([, v]) => v));
  return (
    <div className="ops">
      <header className="ops-head">
        <div>
          <h1>Terrace <span>ops</span></h1>
          <p>Monad testnet · from the Envio index of Terrace&apos;s contracts · updated {new Date(s.at * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC · AI agents and E2E test markets excluded unless noted</p>
        </div>
        <nav className="ops-range" aria-label="Date range">
          {RANGES.map((r) => (
            <Link key={r} href={`/ops?key=${encodeURIComponent(key!)}&days=${r}`} className={r === days ? "on" : ""} prefetch={false}>{r}d</Link>
          ))}
        </nav>
      </header>

      <h2>On-chain</h2>
      <TxCounter opsKey={key!} initial={await txs} />

      <h2>Sign-ups</h2>
      {s.signups && s.funnel ? (
        <div className="ops-split" style={{ marginTop: 0 }}>
          <section className="ops-tiles" style={{ alignContent: "start" }}>
            <Tile label="Accounts created" value={n(s.signups.total)} sub="first $100 in test dollars minted" />
            <Tile label="New accounts" value={n(s.signups.new24h)} sub={`last 24h · ${n(s.signups.new7d)} in 7 days`} />
            <Tile label="Signed up, never played" value={n(s.funnel.signedUp - s.funnel.acted)} sub={`${pct(s.funnel.signedUp - s.funnel.acted, s.funnel.signedUp)} of accounts`} />
            <Tile label="Needed a refill" value={n(s.signups.refilled)} sub="ran below $50 and got topped up" />
          </section>
          <section className="ops-card">
            <h3>From sign-up to regular</h3>
            <div className="ops-mix">
              {([["Signed up", s.funnel.signedUp], ["Did something on-chain", s.funnel.acted], ["Placed a bet", s.funnel.bet], ["Came back another day", s.funnel.returned]] as [string, number][]).map(([label, v]) => (
                <div key={label} className="ops-mix-row ops-funnel" title={`${label}: ${n(v)}`}>
                  <span>{label}</span>
                  <i><b style={{ width: `${(v / Math.max(1, s.funnel!.signedUp)) * 100}%` }} /></i>
                  <em>{n(v)} <small>{pct(v, s.funnel!.signedUp)}</small></em>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <p className="ops-note">Sign-ups appear once the indexer with the TerraceUSD mint handler is deployed (push <code>main:envio</code>, then point <code>INDEXER_URL</code> at the new deployment).</p>
      )}

      <h2>Fans</h2>
      <section className="ops-tiles">
        <Tile label="Fans who've played" value={n(fans.total)} sub={`+ ${n(fans.agents)} AI agents`} />
        <Tile label="New fans" value={n(fans.new24h)} sub={`last 24h · ${n(fans.new7d)} in 7 days`} />
        <Tile label="Active fans" value={n(fans.dau)} sub={`last 24h · ${n(fans.wau)} in 7 days`} />
        <Tile label="Came back" value={n(fans.returning)} sub={`active on 2+ days · ${n(fans.streak3)} on a 3-day streak`} />
      </section>

      <section className="ops-charts">
        {s.signups ? (
          <Bars title="Sign-ups per day" rows={s.series} value={(i) => s.series[i].signups ?? 0} fmt={n} />
        ) : (
          <Bars title="New fans per day" rows={s.series} value={(i) => s.series[i].newFans} fmt={n} />
        )}
        <Bars title="Active fans per day" rows={s.series} value={(i) => s.series[i].active} fmt={n} />
        <Bars title="Fan bet volume per day" rows={s.series} value={(i) => s.series[i].volume} fmt={(v) => usd(v).replace(/\.00$/, "")} />
      </section>
      <details className="ops-card ops-table-toggle">
        <summary>Show the daily numbers as a table</summary>
        <table className="ops-table">
          <thead><tr><th>Day (UTC)</th>{s.signups && <th>Sign-ups</th>}<th>New fans</th><th>Active fans</th><th>Bet volume</th></tr></thead>
          <tbody>{s.series.slice().reverse().map((r) => <tr key={r.day}><td>{r.label}</td>{s.signups && <td>{r.signups}</td>}<td>{r.newFans}</td><td>{r.active}</td><td>{usd(r.volume)}</td></tr>)}</tbody>
        </table>
      </details>

      <h2>Betting</h2>
      <section className="ops-tiles">
        <Tile label="Bets by fans" value={n(money.bets)} sub={`${n(money.bettors)} fans have bet`} />
        <Tile label="Volume · test dollars" value={usd(money.volumeTusd)} sub={`${usd(money.volumeUsdc)} in testnet USDC`} />
        <Tile label="Paid out to fans" value={usd(money.paidOut)} sub="winning bets" />
        <Tile label="Markets" value={n(money.markets)} sub={`${n(money.fromTakes)} from chat takes · ${n(money.sealed)} sealed · ${n(money.settled)} settled`} />
        <Tile label="AI and house bets" value={n(money.agentBets)} sub={`${usd(money.agentVolume)} of liquidity`} />
      </section>

      <h2>Social</h2>
      <section className="ops-tiles">
        <Tile label="Takes posted" value={n(social.takes)} sub="match and league chat" />
        <Tile label="Follows" value={n(social.follows)} sub={`${n(social.followers)} fans follow someone`} />
        <Tile label="1v1s sent" value={n(social.matchups)} sub={`${n(social.matchupsAccepted)} accepted`} />
        <Tile label="Parlays" value={n(social.parlays)} />
        <Tile label="Leagues" value={n(social.leagues)} sub={`${n(social.privateLeagues)} private · ${n(social.leagueMembers)} members`} />
        <Tile label="Fans brought in" value={n(social.invites)} sub="joined through a 1v1 or league invite" />
      </section>

      <div className="ops-split">
        <section className="ops-card">
          <h3>What fans do</h3>
          <div className="ops-mix">
            {s.mix.map(([label, v]) => (
              <div key={label} className="ops-mix-row" title={`${label}: ${n(v)}`}>
                <span>{label}</span>
                <i><b style={{ width: `${(v / mixMax) * 100}%` }} /></i>
                <em>{n(v)}</em>
              </div>
            ))}
          </div>
        </section>
        <section className="ops-card">
          <h3>Latest on-chain activity</h3>
          <ul className="ops-feed">
            {s.recent.map((r, i) => (
              <li key={i}>
                <span className="who">{fanName(r.actor, r.agent)}</span> {KIND[r.kind] ?? r.kind.toLowerCase()}
                {r.amount ? <b> {usd(r.amount)}</b> : null}
                {r.what && <span className="what"> · {r.what}</span>}
                <time>{ago(r.at, s.at)}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="ops-card">
        <h3>Top fans by Terrace Points</h3>
        <div className="ops-scroll">
          <table className="ops-table">
            <thead><tr><th>#</th><th>Fan</th><th>Address</th><th>Points</th><th>Settled</th><th>Win rate</th><th>Followers</th><th>First seen</th><th>Last active</th></tr></thead>
            <tbody>
              {s.top.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{fanName(p.id)}</td>
                  <td className="mono"><a href={`https://testnet.monadexplorer.com/address/${p.id}`} target="_blank" rel="noreferrer">{short(p.id)}</a></td>
                  <td>{n(p.points)}</td>
                  <td>{p.results}</td>
                  <td>{p.results ? `${Math.round((p.wins / p.results) * 100)}%` : "–"}</td>
                  <td>{p.followers}</td>
                  <td>{ago(p.firstSeen, s.at)}</td>
                  <td>{ago(p.lastSeen, s.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
