"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignIn } from "./SignIn";
import { useAccount } from "@/lib/account";
import { createLeague, randomCode } from "@/lib/leagues";

export function CreateLeague() {
  const { status, send } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [gameweeks, setGameweeks] = useState(4);
  const [entry, setEntry] = useState(0);
  const [isPrivate, setPrivate] = useState(true);
  const [governed, setGoverned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <button className="cta" onClick={() => setOpen(true)}>Start a league</button>;
  if (status !== "ready") return <SignIn reason="Sign in to start a league." />;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const code = isPrivate ? randomCode() : "";
      const id = await createLeague(send, { name: name.trim(), gameweeks, maxMembers: 50, money: "usd", entry, isPrivate, governed, code });
      router.push(`/l/${id}${code ? `?code=${code}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="sheet">
      <label className="field">League name<input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="The Kop End" /></label>
      <p className="muted">Gameweeks</p>
      <div className="chips">{[1, 4, 8, 38].map((n) => <button key={n} className={`chip${gameweeks === n ? " on" : ""}`} onClick={() => setGameweeks(n)}>{n}</button>)}</div>
      <p className="muted">Entry (goes to the season prize)</p>
      <div className="chips">{[0, 5, 10, 25].map((n) => <button key={n} className={`chip${entry === n ? " on" : ""}`} onClick={() => setEntry(n)}>{n ? `$${n}` : "Free"}</button>)}</div>
      <p className="muted">Who runs it</p>
      <div className="chips">
        <button className={`chip${governed ? " on" : ""}`} onClick={() => setGoverned(true)}>The members vote</button>
        <button className={`chip${!governed ? " on" : ""}`} onClick={() => setGoverned(false)}>I do</button>
      </div>
      <p className="muted">Table</p>
      <div className="chips">
        <button className={`chip${isPrivate ? " on-violet" : ""}`} onClick={() => setPrivate(true)}>Private · sealed picks</button>
        <button className={`chip${!isPrivate ? " on" : ""}`} onClick={() => setPrivate(false)}>Open to anyone</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>{isPrivate ? "Invite link only. Everyone's picks stay sealed until the gameweek is over, so nobody can copy." : "Anyone can find and join it."}</p>
      <div>
      </div>
      <p />
      <button className="cta" disabled={busy || !name.trim()} onClick={create}>{busy ? "Setting up the league…" : "Create league"}</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
