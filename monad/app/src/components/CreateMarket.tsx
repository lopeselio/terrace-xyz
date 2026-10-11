"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { compileTake, FeeSlider, StakeChips, TakeReading, type Compiled } from "./TakeSheet";
import { Crest, Empty, Sheet, SheetHead } from "./ui";
import { useAccount } from "@/lib/account";
import { listTake, postMessage, type Money } from "@/lib/play";
import { balanceChanged } from "@/lib/useBalance";
import "@/styles/create.css";

export type CreateFixture = { id: number; kickoff: number; status: string; league: string; home: { name: string; logo: string }; away: { name: string; logo: string } };

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const when = (f: CreateFixture) =>
  LIVE.has(f.status)
    ? "Live now"
    : new Date(f.kickoff * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * New market (handoff screen-create): say the take, pick the match, the AI writes the settlement rule
 * and you read it in plain English, set your cut, back it. Publishing posts the take to the match room
 * and opens its market in one go.
 */
export function CreateMarket({ fixtures, initial }: { fixtures: CreateFixture[]; initial?: number }) {
  const router = useRouter();
  const { status, address, send } = useAccount();
  const [text, setText] = useState("");
  const [fixture, setFixture] = useState<CreateFixture | null>(fixtures.find((f) => f.id === initial) ?? fixtures[0] ?? null);
  const [picking, setPicking] = useState(false);
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [reading, setReading] = useState(false);
  const [feeBps, setFeeBps] = useState(300);
  const [dollars, setDollars] = useState(5);
  const [money, setMoney] = useState<Money>("usd");
  const [busy, setBusy] = useState<"post" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = text.trim().length >= 6 && !!fixture;
  const reset = () => setCompiled(null);

  async function read() {
    if (!ready) return;
    setReading(true);
    setError(null);
    setCompiled(await compileTake(text.trim(), fixture!.id));
    setReading(false);
  }

  async function publish() {
    if (!compiled || compiled.error || !fixture || !address) return;
    setBusy("publish");
    setError(null);
    try {
      const messageId = await postMessage(send, 0, BigInt(fixture.id), text.trim());
      await listTake(send, address, { messageId, fixtureId: BigInt(fixture.id), closeTime: compiled.closeTime, text: text.trim(), spec: compiled.spec, money, dollars, feeBps });
      balanceChanged();
      router.push(`/m/${fixture.id}#take-${messageId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function justPost() {
    if (!fixture || !text.trim()) return;
    setBusy("post");
    setError(null);
    try {
      const messageId = await postMessage(send, 0, BigInt(fixture.id), text.trim());
      router.push(`/m/${fixture.id}#take-${messageId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const expired = compiled && !compiled.error && compiled.closeTime * 1000 <= Date.now();

  return (
    <>
      <Header title="New market" sub="Football only · settles automatically" balance={false} />
      {fixtures.length === 0 ? (
        <Empty title="No matches to call">New fixtures land before each matchday. Check back soon.</Empty>
      ) : (
        <div className="sec" style={{ paddingBottom: 90 }}>
          <div className="flabel">The question</div>
          <label className="field">
            <textarea
              value={text}
              maxLength={140}
              placeholder="e.g. Haaland scores in the first half"
              onChange={(e) => {
                setText(e.target.value);
                reset();
              }}
            />
          </label>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span className="umeta">Say it like you would to a mate. Terrace AI turns it into a rule.</span>
            <span className="umeta">{text.length} / 140</span>
          </div>

          <div className="flabel" style={{ marginTop: 20 }}>Match</div>
          <button type="button" className="field match-pick" onClick={() => setPicking(true)}>
            {fixture && (
              <span className="crest-pair">
                <Crest logo={fixture.home.logo} name={fixture.home.name} />
                <Crest logo={fixture.away.logo} name={fixture.away.name} />
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="uname" style={{ display: "block" }}>{fixture ? `${fixture.home.name} v ${fixture.away.name}` : "Pick a match"}</span>
              {fixture && <span className="umeta" style={{ display: "block" }}>{fixture.league} · {when(fixture)}</span>}
            </span>
            <Icon name="chevronRight" size={16} />
          </button>

          {compiled && !compiled.error && (
            <>
              <div className="flabel ai-label" style={{ marginTop: 20 }}><Icon name="bolt" size={14} /> Terrace AI turned your take into a rule</div>
              <TakeReading compiled={compiled} kickoff={fixture?.kickoff} />
              {expired && <p className="error" style={{ marginTop: 8 }}>Betting on this one has already closed. Try a take about later in the match.</p>}

              <div className="flabel" style={{ marginTop: 20 }}>Your cut</div>
              <FeeSlider bps={feeBps} onChange={setFeeBps} />

              <div className="flabel" style={{ marginTop: 20 }}>Back it with</div>
              <StakeChips dollars={dollars} setDollars={setDollars} money={money} setMoney={setMoney} />
              <div className="umeta" style={{ marginTop: 8 }}>You open the market on your own take. Fans back or fade it; winners split the pool.</div>
            </>
          )}
          {compiled?.error && <p className="error" style={{ marginTop: 14 }}>{compiled.error}</p>}
          {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}

          {status !== "ready" ? (
            compiled && !compiled.error && <SignIn reason="Looks good? Sign in to publish it. One passkey, no forms." />
          ) : (
            text.trim() && fixture && (
              <button type="button" className="textbtn" style={{ marginTop: 16 }} disabled={!!busy} onClick={justPost}>
                {busy === "post" ? "Posting…" : "Or just post it to the match chat ›"}
              </button>
            )
          )}
        </div>
      )}

      {fixtures.length > 0 && !(status !== "ready" && compiled && !compiled.error) && (
        <div className="dock">
          {compiled && !compiled.error ? (
            <button className="cta" disabled={!!busy || !!expired} onClick={publish}>
              {busy === "publish" ? "Putting it on the board…" : `Publish market · $${dollars}`}
            </button>
          ) : (
            <button className="cta" disabled={!ready || reading} onClick={read}>
              {reading ? (<><span className="spinner" style={{ width: 18, height: 18, borderTopColor: "var(--on-green)" }} /> Terrace AI is reading your take…</>) : (<><Icon name="bolt" size={18} /> See how it settles</>)}
            </button>
          )}
        </div>
      )}

      {picking && (
        <Sheet onClose={() => setPicking(false)}>
          <SheetHead title="Pick the match" onClose={() => setPicking(false)} />
          <div style={{ marginTop: 8 }}>
            {fixtures.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`fixture-opt${fixture?.id === f.id ? " on" : ""}`}
                onClick={() => {
                  setFixture(f);
                  reset();
                  setPicking(false);
                }}
              >
                <span className="crest-pair">
                  <Crest logo={f.home.logo} name={f.home.name} />
                  <Crest logo={f.away.logo} name={f.away.name} />
                </span>
                <span style={{ flex: 1 }}>
                  <span className="uname" style={{ display: "block" }}>{f.home.name} v {f.away.name}</span>
                  <span className="umeta" style={{ display: "block" }}>{f.league} · {when(f)}</span>
                </span>
                {fixture?.id === f.id && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
