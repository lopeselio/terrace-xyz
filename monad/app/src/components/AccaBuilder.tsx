"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Badge, Empty, FixtureArt, FixtureTag, Seg, Sheet, SheetHead, SkeletonCards, money } from "./ui";
import { useAccount } from "@/lib/account";
import { publicClient } from "@/lib/chain";
import { ADDR, parlaysAbi } from "@/lib/contracts";
import { query } from "@/lib/indexer";
import { combined, fractional, price } from "@/lib/odds";
import { useMatchPrices } from "@/lib/picks";
import { tokenOf, type Money } from "@/lib/play";
import { MAX_LEGS, MIN_LEGS, readSlip, removeLeg, toggleLeg, writeSlip, type SlipLeg } from "@/lib/slip";
import { claimAcca, KIND, placeAcca, settleAcca, standardQuestion, type Leg } from "@/lib/social";
import { balanceChanged } from "@/lib/useBalance";
import { useMatches, type MatchLite } from "@/lib/useMatches";
import "@/styles/parlay.css";

const WEEK = 7 * 86_400;
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const STD = [KIND.HOME, KIND.DRAW, KIND.AWAY, KIND.OVER, KIND.BTTS];

type TakeMarket = { id: string; yesPool: string; noPool: string; question: { id: string; text: string; closeTime: string; fixture: { id: string } | null } };
type Acca = { id: string; token: string; stake: string; legs: number; liveLegs: number; status: number; payout: string | null; potId: string };
type Pot = { total: bigint; unsettled: number; winningWeight: bigint };

/** One pickable leg in the list. */
type Option = { key: string; label: string; sub: string; group: "result" | "goals" | "take"; fixtureId: number; kind?: number; questionId?: string; close: number; decimal: number | null; live: boolean; league?: string; tail: string; m?: MatchLite };

const legName = (m: MatchLite, kind: number) =>
  kind === KIND.HOME ? `${m.home.name} to win` : kind === KIND.AWAY ? `${m.away.name} to win` : kind === KIND.DRAW ? "Draw" : kind === KIND.OVER ? "Over 2.5 goals" : "Both teams to score";

/** Build a parlay: 2–8 legs that all have to land; every parlay joins its week's pot. */
export function AccaBuilder() {
  const { status, address, send } = useAccount();
  const matches = useMatches();
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [takes, setTakes] = useState<TakeMarket[]>([]);
  const [filter, setFilter] = useState("all");
  const [sheet, setSheet] = useState(false);
  const [accas, setAccas] = useState<Acca[] | null>(null);
  const [pots, setPots] = useState<Map<string, Pot>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSlip(readSlip());
    sync();
    window.addEventListener("terrace-slip", sync);
    return () => window.removeEventListener("terrace-slip", sync);
  }, []);

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    query<{ Market: TakeMarket[] }>(
      `query T($now: numeric!) { Market(where: { take_id: { _is_null: false }, isSealed: { _eq: false }, question: { answer: { _eq: 0 }, closeTime: { _gt: $now } } }, order_by: { volume: desc }, limit: 30) {
        id yesPool noPool question { id text closeTime fixture { id } } } }`,
      { now },
    )
      .then((d) => setTakes(d.Market.filter((m) => !m.question.text.startsWith("E2E "))))
      .catch(() => {});
  }, []);

  const fixtures = useMemo(() => [...matches.values()].sort((a, b) => a.kickoff - b.kickoff), [matches]);
  const prices = useMatchPrices(fixtures.map((m) => m.id));
  const stdDecimal = useCallback(
    (fid: number, kind: number, side: 1 | 2) => {
      const s = prices.std.get(`${fid}-${kind}`);
      const pool = s ? (side === 1 ? { side: Number(s.yesPool), other: Number(s.noPool) } : { side: Number(s.noPool), other: Number(s.yesPool) }) : null;
      const l = prices.lines[fid];
      const opening = !l ? null : kind === KIND.HOME ? (side === 1 ? l.home : null) : kind === KIND.DRAW ? (side === 1 ? l.draw : null) : kind === KIND.AWAY ? (side === 1 ? l.away : null) : kind === KIND.OVER ? (side === 1 ? l.over25 : l.under25) : side === 1 ? l.bttsYes : l.bttsNo;
      return price(pool, opening).decimal;
    },
    [prices.std, prices.lines],
  );

  const now = Date.now() / 1000;
  const options: Option[] = useMemo(() => {
    const out: Option[] = [];
    for (const m of fixtures) {
      if (m.kickoff <= now || !(m.status === "NS" || m.status === "TBD")) continue;
      for (const k of STD) {
        out.push({
          key: `${m.id}-${k}-1`, label: legName(m, k), sub: `${m.home.name} v ${m.away.name} · ${k === KIND.OVER || k === KIND.BTTS ? "Goals" : "Match result"}`,
          group: k === KIND.OVER || k === KIND.BTTS ? "goals" : "result", fixtureId: m.id, kind: k, close: m.kickoff, decimal: stdDecimal(m.id, k, 1), live: false, league: m.league,
          tail: k === KIND.OVER || k === KIND.BTTS ? "Goals" : "Match result", m,
        });
      }
    }
    for (const t of takes) {
      const m = t.question.fixture ? matches.get(Number(t.question.fixture.id)) : undefined;
      const yes = Number(t.yesPool), no = Number(t.noPool);
      out.push({
        key: `q${t.id}`, label: t.question.text, sub: `${m ? `${m.home.name} v ${m.away.name}` : "Match room"} · Fan take`, group: "take",
        fixtureId: m?.id ?? 0, questionId: t.question.id, close: Number(t.question.closeTime), decimal: price({ side: yes, other: no }, null).decimal,
        live: !!m && LIVE.has(m.status), league: m?.league, tail: "Fan take", m,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures, takes, stdDecimal, matches]);

  const leagues = [...new Set(options.map((o) => o.league).filter(Boolean))] as string[];
  const shown = options.filter((o) =>
    filter === "all" ? true : filter === "live" ? o.live : filter === "result" || filter === "goals" || filter === "take" ? o.group === filter : o.league === filter,
  );

  const isOn = (o: Option) => slip.some((l) => (o.questionId ? l.questionId === o.questionId : !l.questionId && l.fixtureId === o.fixtureId && l.kind === o.kind && l.side === 1));
  const optionFor = (l: SlipLeg) => options.find((o) => (l.questionId ? o.questionId === l.questionId : !o.questionId && o.fixtureId === l.fixtureId && o.kind === l.kind));
  const legDecimal = (l: SlipLeg) => {
    if (l.kind && !l.questionId) return stdDecimal(l.fixtureId, l.kind, l.side);
    const o = optionFor(l);
    return o?.decimal ?? null;
  };
  const extra = slip.filter((l) => !optionFor(l) || (l.kind && l.side === 2));
  const decimals = slip.map(legDecimal);
  const guide = decimals.every((d) => d) ? combined(decimals as number[]) : null;
  const ready = slip.length >= MIN_LEGS && slip.length <= MAX_LEGS;

  function toggle(o: Option) {
    setError(null);
    if (!isOn(o) && slip.length >= MAX_LEGS) return setError(`A parlay takes up to ${MAX_LEGS} legs.`);
    toggleLeg({ key: o.key, label: o.label, side: 1, fixtureId: o.fixtureId, kind: o.kind, questionId: o.questionId });
  }

  // Your parlays and their pots -----------------------------------------------------
  const loadAccas = useCallback(() => {
    if (!address) return;
    query<{ Parlay: Acca[] }>(`query A($me: String!) { Parlay(where: { player: { _eq: $me } }, order_by: { id: desc }) { id token stake legs liveLegs status payout potId } }`, { me: address.toLowerCase() })
      .then(async (d) => {
        setAccas(d.Parlay);
        const keys = [...new Set(d.Parlay.filter((a) => a.status === 1 || a.status === 2).map((a) => `${a.token}:${a.potId}`))];
        const read = await Promise.all(
          keys.map(async (k) => {
            const [token, potId] = k.split(":");
            const [total, unsettled, winningWeight] = await publicClient.readContract({ address: ADDR.parlays, abi: parlaysAbi, functionName: "pots", args: [token as Address, BigInt(potId)] });
            return [k, { total, unsettled, winningWeight }] as const;
          }),
        );
        setPots(new Map(read));
      })
      .catch(() => setAccas([]));
  }, [address]);
  useEffect(() => { loadAccas(); }, [loadAccas]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      balanceChanged();
      loadAccas();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="chiprow" style={{ paddingTop: 12 }}>
        {[
          { id: "all", label: "All football" },
          { id: "live", label: <><Icon name="flame" size={14} /> Live</> },
          { id: "result", label: "Match result" },
          { id: "goals", label: "Goals" },
          { id: "take", label: "Fan takes" },
          ...(leagues.length > 1 ? leagues.map((l) => ({ id: l, label: l })) : []),
        ].map((c) => (
          <button key={c.id} className={`chip${filter === c.id ? " on" : ""}`} onClick={() => setFilter(c.id)}>{c.label}</button>
        ))}
      </div>

      <div className="pad" style={{ paddingTop: 10 }}>
        {error && !sheet && <p className="error" style={{ marginBottom: 10 }}>{error}</p>}

        {extra.length > 0 && (
          <>
            <div className="eyebrow" style={{ marginBottom: 9 }}>On your slip</div>
            {extra.map((l) => {
              const d = legDecimal(l);
              return (
                <div key={l.key} className="card leg on row">
                  <button className="box" aria-label="Remove leg" onClick={() => removeLeg(l.key)}><Icon name="check" size={14} /></button>
                  <FixtureArt m={matches.get(l.fixtureId)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="q">{l.label}</div>
                    <div className="umeta">{optionFor(l) || d ? "Picked in a match room" : "Closed: remove it to place your parlay"}</div>
                  </div>
                  <span className="p">{d ? fractional(d) : "—"}</span>
                </div>
              );
            })}
            <div style={{ height: 16 }} />
          </>
        )}

        {matches.size === 0 && takes.length === 0 ? (
          <SkeletonCards n={3} odds={0} />
        ) : options.length === 0 ? (
          <Empty title="No open matches right now" action={<Link href="/take" className="btn-out"><Icon name="plus" size={14} /> Create a market</Link>}>
            Legs open when the next fixtures are scheduled.
          </Empty>
        ) : (
          <>
            <div className="eyebrow" style={{ marginBottom: 9 }}>Open markets · {shown.length}</div>
            {shown.length === 0 && <p className="umeta" style={{ padding: "12px 0" }}>Nothing open in this filter.</p>}
            {shown.map((o) => {
              const on = isOn(o);
              return (
                <button key={o.key} type="button" className={`card card-tap leg${on ? " on" : ""}`} onClick={() => toggle(o)}>
                  <div className="row">
                    <span className="box">{on && <Icon name="check" size={14} />}</span>
                    <FixtureArt m={o.m} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="q">{o.label}</div>
                      <div className="umeta">{o.m ? <FixtureTag m={o.m} tail={` · ${o.tail}`} /> : o.sub}</div>
                    </div>
                    <span className="p">{fractional(o.decimal)}</span>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {status === "ready" && accas && accas.length > 0 && (
          <div className="sec" style={{ padding: "22px 0 0" }}>
            <div className="sec-hd"><h3>Your parlays</h3></div>
            {accas.map((a) => {
              const potEnds = (Number(a.potId) + 1) * WEEK;
              const pot = pots.get(`${a.token}:${a.potId}`);
              const ended = now >= potEnds;
              const won = a.status === 1;
              const refundable = a.status === 2 && pot && pot.winningWeight === 0n;
              const share = won && pot && pot.winningWeight > 0n ? (pot.total * BigInt(a.stake) * BigInt(a.liveLegs)) / pot.winningWeight : null;
              const [label, tone] =
                a.status === 0 ? ["Open", "flash"] : a.status === 1 ? ["Won", "won"] : a.status === 2 ? ["Lost", "lost"] : a.status === 3 ? ["Refunded", "settled"] : ["Paid", "won"];
              return (
                <div key={a.id} className="card">
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div className="uname">{a.legs}-leg parlay</div>
                      <div className="row" style={{ gap: 6, marginTop: 6 }}><span className="badge b-settled">{money(a.stake)} stake</span></div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Badge tone={tone as "flash"}>{label}</Badge>
                      <div className="cond" style={{ fontSize: 20, marginTop: 6, color: a.status === 2 ? "var(--ink-3)" : "var(--green)" }}>
                        {a.payout ? money(a.payout) : share !== null ? `~${money(share)}` : money(Number(a.stake) * a.legs)}
                      </div>
                    </div>
                  </div>
                  <div className="umeta" style={{ marginTop: 8 }}>
                    {a.payout
                      ? `Collected ${money(a.payout)}`
                      : a.status === 0
                        ? `Weight ${money(a.stake)} × ${a.legs} legs · pot closes ${new Date(potEnds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
                        : won && !ended
                          ? `Your share so far. The pot closes ${new Date(potEnds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}.`
                          : won && pot && pot.unsettled > 0
                            ? "Waiting for the week's other parlays to be checked."
                            : refundable
                              ? "Nobody's parlay landed this week, so stakes come back."
                              : a.status === 2
                                ? "A leg didn't land."
                                : ""}
                  </div>
                  {a.status === 0 && (
                    <button className="cta cta-ghost cta-sm" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => run(`s${a.id}`, () => settleAcca(send, BigInt(a.id)))}>
                      {busy === `s${a.id}` ? "Checking…" : "Check my legs"}
                    </button>
                  )}
                  {(won || refundable) && ended && pot && pot.unsettled === 0 && (
                    <button className="cta cta-sm" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => run(`c${a.id}`, () => claimAcca(send, BigInt(a.id)))}>
                      {busy === `c${a.id}` ? "Collecting…" : refundable ? "Take my stake back" : "Collect"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="parlay-spacer" />
      </div>

      <button className="slipbar" disabled={!ready} onClick={() => setSheet(true)}>
        <span className="n">{slip.length}</span>
        <b>{slip.length < MIN_LEGS ? `Pick ${MIN_LEGS - slip.length === 2 ? "2 legs" : "1 more leg"} to start` : `${slip.length}-leg parlay`}</b>
        {ready && <span className="rt">{guide ? fractional(guide) : ""} <Icon name="chevronRight" size={16} /></span>}
      </button>

      {sheet && (
        <ParlaySheet
          slip={slip}
          matches={matches}
          decimals={decimals}
          guide={guide}
          closes={slip.map((l) => (l.kind && !l.questionId ? matches.get(l.fixtureId)?.kickoff ?? 0 : optionFor(l)?.close ?? 0))}
          signedIn={status === "ready"}
          onClose={() => setSheet(false)}
          onPlace={async (dollars, money) => {
            const legs: Leg[] = [];
            for (const l of slip) {
              const questionId = l.questionId ? BigInt(l.questionId) : await standardQuestion(send, l.fixtureId, l.kind!, l.kind === KIND.OVER ? 2 : 0);
              legs.push({ questionId, side: l.side });
            }
            await placeAcca(send, address!, legs, tokenOf(money), dollars);
            writeSlip([]);
            balanceChanged();
            loadAccas();
          }}
        />
      )}
    </>
  );
}

/** The parlay slip sheet: legs, combined price (a guide), stake, the pot, Place parlay. */
function ParlaySheet({
  slip, matches, decimals, guide, closes, signedIn, onClose, onPlace,
}: {
  slip: SlipLeg[];
  matches: Map<number, MatchLite>;
  decimals: (number | null)[];
  guide: number | null;
  closes: number[];
  signedIn: boolean;
  onClose: () => void;
  onPlace: (dollars: number, money: Money) => Promise<void>;
}) {
  const [stake, setStake] = useState("10");
  const [currency, setCurrency] = useState<Money>("usd");
  const [pot, setPot] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<number | null>(null);
  const dollars = Math.max(0, Number(stake) || 0);
  const potId = Math.floor(Math.max(...closes, 0) / WEEK);
  const potEnds = (potId + 1) * WEEK;

  useEffect(() => {
    publicClient
      .readContract({ address: ADDR.parlays, abi: parlaysAbi, functionName: "pots", args: [tokenOf(currency), BigInt(potId)] })
      .then(([total]) => setPot(total))
      .catch(() => setPot(null));
  }, [currency, potId]);

  async function place() {
    setBusy(true);
    setError(null);
    try {
      await onPlace(dollars, currency);
      setPlaced(dollars);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (placed !== null) {
    return (
      <Sheet onClose={onClose}>
        <div style={{ textAlign: "center" }}>
          <div className="versus-glyph" style={{ width: 58, height: 58, borderRadius: "50%", margin: "6px auto 14px", background: "var(--green-deep)", border: "1.5px solid var(--green)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" size={26} />
          </div>
          <div className="sheet-title" style={{ fontSize: 26 }}>Parlay placed</div>
          <div className="umeta" style={{ fontSize: 13, marginTop: 4 }}>
            ${placed.toFixed(2)} on {slip.length} legs. Check your legs after full time; the pot pays out once the week closes.
          </div>
          <button className="cta cta-sm" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <SheetHead eyebrow={`${slip.length} legs · all must land`} title={<>Parlay <span className="green">{guide ? fractional(guide) : ""}</span></>} onClose={onClose} />
      <div className="card parlay-legs" style={{ marginTop: 14, padding: "4px 14px" }}>
        {slip.map((l, i) => (
          <div key={l.key} className="kv">
            <span className="k row" style={{ gap: 10 }}><FixtureArt m={matches.get(l.fixtureId)} size={24} /><span style={{ minWidth: 0 }}>{l.label}</span></span>
            <span className="v">{decimals[i] ? fractional(decimals[i]) : "—"}</span>
          </div>
        ))}
        <div className="kv">
          <span className="k" style={{ color: "var(--ink-2)" }}>Combined price (guide)</span>
          <span className="v green" style={{ fontSize: 20 }}>{guide ? fractional(guide) : "—"}</span>
        </div>
      </div>

      {!signedIn ? (
        <div style={{ marginTop: 16 }}><SignIn bare reason="Sign in to place your parlay." /></div>
      ) : (
        <>
          <div className="flabel" style={{ marginTop: 16 }}>Stake</div>
          <label className="field row" style={{ gap: 8 }}>
            <span style={{ color: "var(--ink-3)", fontSize: 19, fontWeight: 600 }}>$</span>
            <input value={stake} inputMode="decimal" aria-label="Stake in dollars" onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
          <div style={{ marginTop: 8 }}>
            <Seg sub value={currency} onChange={setCurrency} options={[{ id: "usd", label: "Test dollars" }, { id: "usdc", label: "USDC" }]} />
          </div>
          <div className="kv" style={{ borderTop: "1px solid var(--line-hair)", marginTop: 12 }}>
            <span className="k">This week&apos;s pot</span>
            <span className="v cond" style={{ fontSize: 20 }}>{pot !== null ? money(pot + BigInt(Math.round(dollars * 1e6))) : "…"}</span>
          </div>
          <div className="kv">
            <span className="k">Potential returns</span>
            <span className="v cond green" style={{ fontSize: 22 }}>{pot !== null ? `Up to ${money(pot + BigInt(Math.round(dollars * 1e6)))}` : "…"}</span>
          </div>
          <div className="umeta" style={{ marginTop: -4, marginBottom: 10 }}>
            Every parlay this week goes into one pot. When it closes ({new Date(potEnds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}), the winners split it by stake × legs, so your weight is ${dollars.toFixed(2)} × {slip.length}. The combined price is a guide to how long the odds are, not a fixed payout. If nobody lands one, everyone gets their stake back.
          </div>
          {error && <p className="error" style={{ marginBottom: 8 }}>{error}</p>}
          <button className="cta" disabled={busy || dollars < 0.1} onClick={place}>
            {busy ? "Placing it…" : `Place parlay · $${dollars.toFixed(dollars % 1 ? 2 : 0)}`}
          </button>
        </>
      )}
      <div className="umeta" style={{ textAlign: "center", marginTop: 11 }}>One leg lost and the parlay is gone. No cash out on parlays yet.</div>
    </Sheet>
  );
}
