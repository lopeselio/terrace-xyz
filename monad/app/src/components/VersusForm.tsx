"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { zeroAddress, type Address } from "viem";
import { Icon } from "./Icon";
import { SignIn } from "./SignIn";
import { Avatar, Odd, Seg, Sheet, SheetHead, fanName } from "./ui";
import { useAccount } from "@/lib/account";
import { useAgents } from "@/lib/agents";
import { useFollows } from "@/lib/follows";
import { tokenOf, type Money } from "@/lib/play";
import { challenge } from "@/lib/social";
import { balanceChanged } from "@/lib/useBalance";
import "@/styles/versus.css";

const STAKES = [1, 5, 10, 25];

/** Prices shown on "Your side": a guide to how likely each call is. A 1v1 itself is even money. */
export type SidePrices = { yes: string; no: string };

/**
 * The 1v1 form from the handoff: your side, opponent (a fan you follow or anyone with the link),
 * equal stakes, "Winner takes", Send challenge. `call` renders above it (a picker or a fixed label).
 */
export function ChallengeForm({
  label, call, prices, getQuestionId, onSent,
}: {
  label: string;
  call?: ReactNode;
  prices?: SidePrices | null;
  getQuestionId: (() => Promise<bigint>) | null;
  onSent: (sent: Sent) => void;
}) {
  const { status, send, address } = useAccount();
  const [side, setSide] = useState<1 | 2>(1);
  const [dollars, setDollars] = useState(5);
  const [money, setMoney] = useState<Money>("usd");
  const [opponent, setOpponent] = useState<Address | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const them = opponent ? fanName(opponent) : "Your mate";

  async function create() {
    if (!address || !getQuestionId) return;
    setBusy(true);
    setError(null);
    try {
      const q = await getQuestionId();
      const id = await challenge(send, address, q, side, tokenOf(money), dollars, opponent ?? zeroAddress);
      balanceChanged();
      onSent({ id, label, side, dollars, opponent });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="versus-form">
      {call}

      <div className="flabel" style={{ marginTop: 18 }}>Your side</div>
      <div className="oddsrow two">
        <Odd label="Back · yes" value={prices?.yes ?? "Yes"} tone="yes" on={side === 1} onClick={() => setSide(1)} />
        <Odd label="Fade · no" value={prices?.no ?? "No"} tone="no" on={side === 2} onClick={() => setSide(2)} />
      </div>
      <div className="umeta" style={{ marginTop: 6 }}>Your mate automatically takes the other side.</div>

      <div className="flabel" style={{ marginTop: 18 }}>Opponent</div>
      <button type="button" className="field row" style={{ textAlign: "left" }} onClick={() => setPicking(true)}>
        {opponent ? (
          <Avatar seed={opponent} />
        ) : (
          <span className="avatar" style={{ background: "var(--raised)", color: "var(--green)", border: "1px solid var(--line)" }}><Icon name="share" size={18} /></span>
        )}
        <span style={{ flex: 1 }}>
          <span className="uname" style={{ display: "block" }}>{opponent ? <FanLabel address={opponent} /> : "Invite by link"}</span>
          <span className="umeta" style={{ display: "block" }}>{opponent ? "Only they can accept" : "First mate to open the link takes it"}</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>

      <div className="flabel" style={{ marginTop: 18 }}>Stake — equal on both sides</div>
      <div className="oddsrow four">
        {STAKES.map((d) => (
          <button key={d} type="button" className={`odd sm${dollars === d ? " on" : ""}`} onClick={() => setDollars(d)}>
            <span className="val">${d}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Seg sub value={money} onChange={setMoney} options={[{ id: "usd", label: "Test dollars" }, { id: "usdc", label: "USDC" }]} />
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="kv flush"><span className="k">You stake</span><span className="v">${dollars.toFixed(2)}</span></div>
        <div className="kv"><span className="k">{them} stakes</span><span className="v">${dollars.toFixed(2)}</span></div>
        <div className="kv" style={{ paddingBottom: 0 }}>
          <span className="k">Winner takes</span>
          <span className="v cond green" style={{ fontSize: 22 }}>${(dollars * 2).toFixed(2)}</span>
        </div>
      </div>

      {status !== "ready" ? (
        <SignIn reason="Sign in to send a challenge." />
      ) : (
        <button className="cta" style={{ marginTop: 14 }} disabled={busy || !getQuestionId} onClick={create}>
          <Icon name="swords" size={16} /> {busy ? "Sending it…" : getQuestionId ? "Send challenge" : "Pick the call first"}
        </button>
      )}
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      <div className="umeta" style={{ textAlign: "center", marginTop: 10 }}>
        Expires if it isn&apos;t accepted before kick-off, and your stake comes back. Settled automatically from the final score.
      </div>

      {picking && (
        <OpponentSheet
          current={opponent}
          me={address}
          onPick={(a) => {
            setOpponent(a);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** "Pick your opponent": fans you follow, or invite by link instead. */
function OpponentSheet({ current, me, onPick, onClose }: { current: Address | null; me: Address | null; onPick: (a: Address | null) => void; onClose: () => void }) {
  const { follows } = useFollows();
  const list = [...follows].filter((a) => a !== me?.toLowerCase()) as Address[];
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="Pick your opponent" onClose={onClose} />
      <div className="flabel" style={{ marginTop: 16 }}>People you follow</div>
      {list.length ? (
        <div className="card" style={{ padding: "4px 14px" }}>
          <div className="rowlist">
            {list.map((a) => (
              <div key={a} className="listrow">
                <Avatar seed={a} />
                <div style={{ flex: 1 }}><div className="uname"><FanLabel address={a} /></div></div>
                <button className={`btn-out${current === a ? " on" : ""}`} onClick={() => onPick(a)}>{current === a ? "Chosen" : "Choose"}</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="umeta" style={{ fontSize: 13 }}>
          You don&apos;t follow anyone yet. Follow fans on the <Link href="/social" className="textbtn">Social</Link> tab to challenge them directly.
        </div>
      )}
      <button className="cta cta-ghost cta-sm" style={{ marginTop: 12 }} onClick={() => onPick(null)}>
        <Icon name="share" size={16} /> Invite by link instead
      </button>
    </Sheet>
  );
}

export type Sent = { id: bigint; label: string; side: 1 | 2; dollars: number; opponent: Address | null };

/** "Challenge sent": who has until kick-off, the link to share, View matchups. */
export function SentSheet({ sent, onClose }: { sent: Sent; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/c/${sent.id}`;
  const text = `I say "${sent.label}" is ${sent.side === 1 ? "happening" : "not happening"}. $${sent.dollars} says you can't call it. Take the other side on Terrace:`;
  async function share() {
    if (navigator.share) await navigator.share({ title: "1v1 on Terrace", text, url: link }).catch(() => {});
    else {
      await navigator.clipboard.writeText(`${text} ${link}`).catch(() => {});
      setCopied(true);
    }
  }
  return (
    <Sheet onClose={onClose}>
      <div style={{ textAlign: "center" }}>
        <div className="versus-glyph"><Icon name="swords" size={26} /></div>
        <div className="sheet-title" style={{ fontSize: 26 }}>Challenge sent</div>
        <div className="umeta" style={{ fontSize: 13, marginTop: 4 }}>
          {sent.opponent ? fanName(sent.opponent) : "Whoever opens the link first"} has until kick-off to accept. ${(sent.dollars * 2).toFixed(2)} winner takes all.
        </div>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <a className="cta cta-ghost cta-sm" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <button className="cta cta-sm" onClick={share}><Icon name="share" size={16} /> {copied ? "Link copied" : "Share link"}</button>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="cta cta-ghost cta-sm" onClick={onClose}>Close</button>
          <Link className="cta cta-ghost cta-sm" href="/challenges?tab=active" onClick={onClose}>View matchups</Link>
        </div>
      </div>
    </Sheet>
  );
}

/** A fan's name, with a small violet "AI" badge for AI players. */
export function FanLabel({ address, you }: { address: string; you?: boolean }) {
  const agents = useAgents();
  if (you) return <>You</>;
  const id = address.toLowerCase();
  const agent = agents.has(id);
  return (
    <>
      {agent && agents.get(id) ? agents.get(id) : fanName(address)}
      {agent && <span className="badge b-private" style={{ marginLeft: 6, verticalAlign: 1 }}>AI</span>}
    </>
  );
}
