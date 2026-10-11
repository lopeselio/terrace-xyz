"use client";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { Icon } from "./Icon";
import { MonadMark } from "./MonadMark";
import { Badge, Sheet, SheetHead, Switch, money } from "./ui";
import { useAccount } from "@/lib/account";
import { balanceChanged, useBalance } from "@/lib/useBalance";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/** Wallet & payouts (screen-wallet.html): the one drawer where the chain shows through. */
export function WalletSheet({ inBets, feesEarned, onClose }: { inBets: number; feesEarned: number | null; onClose: () => void }) {
  const { address, keys, logout } = useAccount();
  const { balance } = useBalance();
  const [details, setDetails] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(what: string, value: string) {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(what);
  }
  async function addFunds() {
    setToppingUp(true);
    await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ address }) }).catch(() => {});
    setToppingUp(false);
    balanceChanged();
  }

  return (
    <Sheet onClose={onClose}>
      <SheetHead title="Wallet & payouts" onClose={onClose} />
      <div className="card" style={{ marginTop: 14 }}>
        <div className="kv flush"><span className="k">Available</span><span className="v cond" style={{ fontSize: 22 }}>{balance ? money(balance.usd) : "…"}</span></div>
        <div className="kv"><span className="k">In open bets</span><span className="v">{money(inBets)}</span></div>
        {feesEarned !== null && (
          <div className="kv" style={{ paddingBottom: 0 }}><span className="k">Creator fees earned</span><span className="v amber">{money(feesEarned)}</span></div>
        )}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="cta cta-sm" disabled={toppingUp} onClick={addFunds}>{toppingUp ? "Adding…" : "Add funds"}</button>
        <button className="cta cta-ghost cta-sm" disabled>Withdraw</button>
      </div>
      <div className="umeta" style={{ textAlign: "center", marginTop: 6 }}>Test dollars while we&apos;re in preview. Withdrawals open at launch.</div>

      <div className="flabel" style={{ marginTop: 20 }}>Advanced</div>
      <div className="card" style={{ padding: "4px 14px" }}>
        {address && (
          <button className="kv" onClick={() => copy("account", address)}>
            <span className="k">Account</span>
            <span className="v row" style={{ gap: 6, color: "var(--ink-2)", fontSize: 12.5 }}>
              {copied === "account" ? "Copied" : short(address)} <Icon name="copy" size={14} />
            </span>
          </button>
        )}
        <div className="kv">
          <div>
            <div className="v">Show network details</div>
            <div className="umeta">Monad testnet · balances · your keys</div>
          </div>
          <Switch on={details} onChange={setDetails} label="Show network details" />
        </div>
        {details && (
          <>
            <div className="kv"><span className="k row" style={{ gap: 8 }}><MonadMark size={18} /> Network</span><span className="v">Monad testnet</span></div>
            <div className="kv"><span className="k">Test dollars</span><span className="v">{balance ? money(balance.usd) : "…"}</span></div>
            <div className="kv"><span className="k">USDC</span><span className="v">{balance ? money(balance.usdc) : "…"}</span></div>
            <div className="kv"><span className="k">MON for fees</span><span className="v">{balance ? Number(formatEther(balance.gas)).toFixed(3) : "…"}</span></div>
            {keys && (
              <button className="kv" onClick={() => copy("agent", keys.agentAccount.address)}>
                <div style={{ textAlign: "left" }}>
                  <div className="v">Your AI agent&apos;s account</div>
                  <div className="umeta">Its own account, from the same passkey</div>
                </div>
                <span className="v row" style={{ gap: 6, color: "var(--ink-2)", fontSize: 12.5 }}>
                  {copied === "agent" ? "Copied" : short(keys.agentAccount.address)} <Icon name="copy" size={14} />
                </span>
              </button>
            )}
            <div className="kv">
              <div><div className="v">Sealing key</div><div className="umeta">Seals private-league picks and sealed bets; reveal them from any device</div></div>
              <Icon name="lock" size={16} />
            </div>
            <div className="kv">
              <div><div className="v">Agent memory key</div><div className="umeta">Encrypts your agent&apos;s notes so only you can read them</div></div>
              <Icon name="shield" size={16} />
            </div>
            <div className="umeta" style={{ padding: "4px 0 12px" }}>
              All of these come from your passkey alone. Nothing is stored on this phone: sign in on any device and it all comes back.
            </div>
          </>
        )}
      </div>
      <div className="row" style={{ justifyContent: "center", gap: 6, marginTop: 14 }}>
        <Badge tone="terrace">Non-custodial</Badge>
        <Badge tone="sealed">Sealed bets</Badge>
      </div>
      <button
        className="cta cta-ghost cta-sm"
        style={{ marginTop: 14 }}
        onClick={() => {
          logout();
          onClose();
        }}
      >
        <Icon name="logout" size={16} /> Sign out
      </button>
    </Sheet>
  );
}
