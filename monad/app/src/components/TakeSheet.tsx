"use client";
import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { Badge, Sheet, SheetHead } from "./ui";
import { useAccount } from "@/lib/account";
import { listTake, type Money } from "@/lib/play";
import { balanceChanged } from "@/lib/useBalance";
import { callStoppage, STOPPAGES, type StoppageCode, showError } from "@/lib/errors";
import "@/styles/create.css";

/** `ai` is set when no model could read the take (it goes to the AI judge); `stoppage` when it couldn't be read at all. */
export type Compiled = { spec: string; reading: string; closeTime: number; ai?: "busy" | "offline"; error?: string; stoppage?: StoppageCode };

const failed = (stoppage: StoppageCode): Compiled => ({ spec: "", reading: "", closeTime: 0, stoppage, error: STOPPAGES[stoppage].title });

/** Ask the take compiler for a settlement rule and its plain-English reading. */
export async function compileTake(text: string, fixtureId: number): Promise<Compiled> {
  try {
    const r = await fetch("/api/compile-take", { method: "POST", body: JSON.stringify({ text, fixtureId }) });
    const body = (await r.json().catch(() => ({ error: "server" }))) as Compiled & { error?: string };
    if (!r.ok || body.error) return failed(body.error && body.error in STOPPAGES ? (body.error as StoppageCode) : "server");
    return body;
  } catch {
    return failed(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "server");
  }
}

/**
 * Tell the fan when Terrace AI or the match data let them down, and what they can still do:
 * try again, or (when the take still compiled for the AI judge) publish it anyway.
 */
export function explainCompile(c: Compiled, retry: () => void) {
  if (c.stoppage) callStoppage(c.stoppage, { primary: { label: "Try again", run: retry }, secondary: { label: "Not now" } });
  else if (c.ai === "busy") callStoppage("ai_busy", { primary: { label: "Try again", run: retry }, secondary: { label: "Publish it anyway" } });
  else if (c.ai === "offline") callStoppage("ai_offline", { primary: { label: "Publish it anyway" }, secondary: { label: "Try again", run: retry } });
}

export const closesLabel = (closeTime: number, kickoff?: number) => {
  const t = new Date(closeTime * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return kickoff && Math.abs(closeTime - kickoff) < 60 ? `Kick-off · ${t}` : t;
};

/** How the compiled take settles: data rule or AI judge, when bets close, and the plain-English reading. */
export function TakeReading({ compiled, kickoff }: { compiled: Compiled; kickoff?: number }) {
  return (
    <div className="card take-reading">
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Badge tone="chainlink">{compiled.spec ? "Match data · Chainlink" : "AI judge · Chainlink"}</Badge>
        <Badge tone="flash" icon="clock">Closes {closesLabel(compiled.closeTime, kickoff)}</Badge>
      </div>
      <div className="eyebrow" style={{ marginTop: 12 }}>How it settles</div>
      <div className="reading" style={{ marginTop: 4 }}>
        {compiled.spec ? compiled.reading : "Terrace AI judges it after full time, from the match report."}
      </div>
      <div className="umeta">
        {compiled.spec
          ? "Checked against live match data every minute; settles the moment it happens."
          : compiled.ai
            ? "Terrace AI couldn't read it just now, so it isn't checked live. If the report doesn't settle it clearly, everyone gets their money back."
            : "No live-data rule fits this one. If the report doesn't settle it clearly, everyone gets their money back."}
      </div>
    </div>
  );
}

/** Creator fee slider: 0–5% of winners' profit goes to the take's author. */
export function FeeSlider({ bps, onChange }: { bps: number; onChange: (bps: number) => void }) {
  return (
    <div className="card fee">
      <div className="row">
        <span style={{ flex: 1, fontSize: 13.5, color: "var(--ink-2)" }}>Creator fee</span>
        <span className="cond green" style={{ fontSize: 24 }}>{(bps / 100).toFixed(1)}%</span>
      </div>
      <input
        type="range" min={0} max={500} step={50} value={bps} aria-label="Creator fee"
        style={{ "--pct": `${bps / 5}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="umeta">0%</span>
        <span className="umeta">of winners&apos; profit · 5% max</span>
      </div>
    </div>
  );
}

/** Stake chips plus the dollars / USDC toggle. */
export function StakeChips({ dollars, setDollars, money, setMoney }: { dollars: number; setDollars: (d: number) => void; money: Money; setMoney: (m: Money) => void }) {
  return (
    <div className="oddsrow four">
      {[1, 5, 10, 25].map((d) => (
        <button key={d} type="button" className={`odd sm${dollars === d ? " on" : ""}`} onClick={() => setDollars(d)}>
          <span className="val">${d}</span>
        </button>
      ))}
      <button type="button" className="chip" style={{ gridColumn: "1 / -1", justifySelf: "start", marginTop: 2 }} onClick={() => setMoney(money === "usd" ? "usdc" : "usd")}>
        Paying in {money === "usdc" ? "USDC" : "test dollars"} · switch
      </button>
    </div>
  );
}

/** "Make it a market" from the chat: the AI turns the take into a rule, the fan reads it, then backs it. */
export function TakeSheet({ messageId, fixtureId, text, onDone, onClose }: { messageId: string; fixtureId: number; text: string; onDone: () => void; onClose?: () => void }) {
  const { send, address } = useAccount();
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [dollars, setDollars] = useState(5);
  const [money, setMoney] = useState<Money>("usd");
  const [feeBps, setFeeBps] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = onClose ?? onDone;
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setCompiled(null);
    let live = true;
    compileTake(text, fixtureId).then((c) => {
      if (!live) return;
      setCompiled(c);
      explainCompile(c, () => setAttempt((n) => n + 1));
    });
    return () => {
      live = false;
    };
  }, [text, fixtureId, attempt]);

  async function list() {
    if (!compiled || !address) return;
    setBusy(true);
    setError(null);
    try {
      await listTake(send, address, { messageId: BigInt(messageId), fixtureId: BigInt(fixtureId), closeTime: compiled.closeTime, text, spec: compiled.spec, money, dollars, feeBps });
      balanceChanged();
      onDone();
    } catch (e) {
      setError(showError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={close}>
      <SheetHead eyebrow="Make it a market" title={text} onClose={close} />
      {!compiled ? (
        <div className="row umeta" style={{ marginTop: 16, gap: 10 }}><span className="spinner" /> Terrace AI is turning your take into a rule…</div>
      ) : compiled.error ? (
        <>
          <p className="error" style={{ marginTop: 16 }}>{compiled.error}</p>
          <button className="cta cta-ghost cta-sm" style={{ marginTop: 12 }} onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size={16} /> Try again
          </button>
        </>
      ) : (
        <>
          <div style={{ marginTop: 14 }}><TakeReading compiled={compiled} /></div>
          <div className="flabel" style={{ marginTop: 16 }}>Your cut</div>
          <FeeSlider bps={feeBps} onChange={setFeeBps} />
          <div className="flabel" style={{ marginTop: 16 }}>Back it with</div>
          <StakeChips dollars={dollars} setDollars={setDollars} money={money} setMoney={setMoney} />
          {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
          <button className="cta" style={{ marginTop: 14 }} onClick={list} disabled={busy}>
            {busy ? "Putting it on the board…" : `Publish market · $${dollars}`}
          </button>
        </>
      )}
    </Sheet>
  );
}
