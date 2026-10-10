"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { useAccount } from "@/lib/account";
import { tokenOf, type Money } from "@/lib/play";
import { challenge } from "@/lib/social";

/** "Challenge a mate": pick your side and stake, get a link anyone can accept to take the other side. */
export function ChallengeSheet({ label, getQuestionId, onClose }: { label: string; getQuestionId: () => Promise<bigint>; onClose: () => void }) {
  const { send, address } = useAccount();
  const [side, setSide] = useState<1 | 2>(1);
  const [dollars, setDollars] = useState(5);
  const [money, setMoney] = useState<Money>("usd");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const q = await getQuestionId();
      const id = await challenge(send, address, q, side, tokenOf(money), dollars);
      setLink(`${window.location.origin}/c/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    const text = `I say "${label}" is ${side === 1 ? "happening" : "not happening"}. $${dollars} says you can't call it. Take the other side on Terrace:`;
    return (
      <div className="sheet">
        <p className="reading">Challenge ready. Send it to your mates.</p>
        <p className="muted" style={{ fontSize: 13 }}>Whoever accepts first takes the other side. No taker by kickoff and your stake comes back.</p>
        <div className="odds-row">
          <a className="cta" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer">
            <Icon name="share" size={18} /> WhatsApp
          </a>
          <button className="cta ghost" onClick={() => (navigator.share ? navigator.share({ text, url: link }) : navigator.clipboard.writeText(link))}>
            <Icon name="copy" size={18} /> Share link
          </button>
        </div>
        <button className="link-btn" onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <div className="sheet">
      <p className="meta">1v1 challenge</p>
      <p className="reading">{label}</p>
      <div className="odds-row">
        <button className={`odds yes`} style={side === 1 ? { borderColor: "var(--green)" } : { opacity: 0.55 }} onClick={() => setSide(1)}>
          <span className="lbl">I say yes</span>
          <span className="val">BACK</span>
        </button>
        <button className={`odds no`} style={side === 2 ? { borderColor: "var(--red)" } : { opacity: 0.55 }} onClick={() => setSide(2)}>
          <span className="lbl">I say no</span>
          <span className="val">FADE</span>
        </button>
      </div>
      <p />
      <div className="chips">
        {[1, 5, 10, 25].map((d) => (
          <button key={d} className={`chip${dollars === d ? " on" : ""}`} onClick={() => setDollars(d)}>${d}</button>
        ))}
        <button className={`chip${money === "usdc" ? " on" : ""}`} onClick={() => setMoney(money === "usd" ? "usdc" : "usd")}>{money === "usdc" ? "USDC" : "Dollars"}</button>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Winner takes ${dollars * 2}. Settled by Chainlink.</p>
      <button className="cta" disabled={busy} onClick={create}>{busy ? "Setting it up…" : `Challenge a mate for $${dollars}`}</button>
      <button className="link-btn" onClick={onClose}>Cancel</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
