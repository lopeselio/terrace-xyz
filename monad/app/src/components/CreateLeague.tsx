"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import { SignIn } from "./SignIn";
import { Badge, Seg, Switch } from "./ui";
import { useAccount } from "@/lib/account";
import { createLeague, randomCode } from "@/lib/leagues";
import "@/styles/leagues.css";

const SIZES = [10, 20, 50, 100] as const;
const WEEKS = [1, 4, 8, 38] as const;
const FEES = [0, 1, 2, 5] as const;

/** Create a league (screen-league-create.html): name, size, length, entry, who runs it, sealed table. */
/* "Who runs it", in plain words: what each choice means for the gameweeks. */
const RUNS: { id: "me" | "members"; icon: IconName; title: string; lede: string; points: string[] }[] = [
  {
    id: "members",
    icon: "users",
    title: "The group votes",
    lede: "Everyone in the league has a say.",
    points: [
      "Any member suggests the next gameweek's matches in Votes",
      "It passes the moment more than half the league votes yes",
      "Otherwise it closes after 24 hours and the most votes win",
      "Invite your mates before the first vote, or it's just yours",
    ],
  },
  {
    id: "me",
    icon: "whistle",
    title: "I do",
    lede: "You're the organiser.",
    points: [
      "You pick each gameweek's matches in Gameweeks",
      "They open for picks straight away, no vote",
      "Members just make their picks and chat",
    ],
  },
];

export function CreateLeague() {
  const { status, send } = useAccount();
  const router = useRouter();
  const [name, setName] = useState("");
  const [size, setSize] = useState<(typeof SIZES)[number]>(20);
  const [gameweeks, setGameweeks] = useState<(typeof WEEKS)[number]>(4);
  const [entry, setEntry] = useState<(typeof FEES)[number]>(0);
  const [isPrivate, setPrivate] = useState(true);
  const [governed, setGoverned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const code = isPrivate ? randomCode() : "";
      const id = await createLeague(send, { name: name.trim(), gameweeks, maxMembers: size, money: "usd", entry, isPrivate, governed, code });
      router.push(`/l/${id}?${code ? `code=${code}&` : ""}new=1`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="sec" style={{ paddingTop: 4 }}>
      <div className="flabel">League name</div>
      <label className="field">
        <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Sharp Eleven" />
      </label>

      <div className="flabel" style={{ marginTop: 20 }}>Size</div>
      <Seg sub value={String(size)} onChange={(v) => setSize(Number(v) as (typeof SIZES)[number])} options={SIZES.map((s) => ({ id: String(s), label: s }))} />

      <div className="flabel" style={{ marginTop: 20 }}>Gameweeks</div>
      <Seg sub value={String(gameweeks)} onChange={(v) => setGameweeks(Number(v) as (typeof WEEKS)[number])} options={WEEKS.map((w) => ({ id: String(w), label: w === 38 ? "Full season" : w }))} />

      <div className="flabel" style={{ marginTop: 20 }}>Entry fee</div>
      <div className="oddsrow four">
        {FEES.map((f) => (
          <button key={f} type="button" className={`odd sm${entry === f ? " on" : ""}`} onClick={() => setEntry(f)}>
            <span className="val">{f ? `$${f}` : "Free"}</span>
          </button>
        ))}
      </div>
      <div className="umeta" style={{ marginTop: 6 }}>Every entry goes to the prize pool. The winner takes the pool at the end of the season.</div>

      <div className="flabel" style={{ marginTop: 20 }}>Who runs it</div>
      <div className="run-choices" role="radiogroup" aria-label="Who runs it">
        {RUNS.map((r) => {
          const on = governed === (r.id === "members");
          return (
            <button key={r.id} type="button" role="radio" aria-checked={on} className={`run-choice${on ? " on" : ""}`} onClick={() => setGoverned(r.id === "members")}>
              <span className="run-icon"><Icon name={r.icon} size={18} /></span>
              <span className="run-body">
                <span className="run-title">{r.title}<span className="run-tick">{on && <Icon name="check" size={14} />}</span></span>
                <span className="run-lede">{r.lede}</span>
                <ul>{r.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flabel" style={{ marginTop: 20 }}>Privacy</div>
      <div className="card" style={{ padding: "4px 14px" }}>
        <div className="kv">
          <div>
            <div className="v row" style={{ gap: 6 }}>Hide standings until reveal <Badge tone="sealed" icon="lock">Sealed</Badge></div>
            <div className="umeta">{isPrivate ? "Invite only. Picks stay hidden until the final whistle, then Chainlink reveals them, so nobody can copy." : "Anyone can find and join. Picks are visible."}</div>
          </div>
          <Switch on={isPrivate} onChange={setPrivate} label="Hide standings until reveal" />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {status !== "ready" ? (
          <SignIn bare reason="Sign in to start a league." />
        ) : (
          <button className="cta" disabled={busy || !name.trim()} onClick={create}>
            <Icon name="trophy" size={18} /> {busy ? "Setting up the league…" : "Create league"}
          </button>
        )}
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}
