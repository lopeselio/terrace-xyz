"use client";
import { useEffect, useState } from "react";
import { SignIn } from "./SignIn";
import { useAccount } from "@/lib/account";
import { publicClient } from "@/lib/chain";
import { ADDR, erc20Abi } from "@/lib/contracts";
import { query } from "@/lib/indexer";

type Player = {
  points: string;
  results: number;
  wins: number;
  winRateBps: number;
  streak: number;
  badge: number;
  predictions: number;
  correctResults: number;
  exactScores: number;
  titles: number;
  takesListed: number;
  takesWon: number;
  backersReceived: number;
};

const BADGES = ["Casual", "Sharp", "Legend"];
const dollars = (v: bigint) => `$${(Number(v) / 1e6).toFixed(2)}`;

export function MyRecord() {
  const { status, address, keys, logout } = useAccount();
  const [p, setP] = useState<Player | null>(null);
  const [money, setMoney] = useState<{ usd: bigint; usdc: bigint } | null>(null);

  useEffect(() => {
    if (!address) return;
    query<{ Player_by_pk: Player | null }>(
      `query P($id: String!) { Player_by_pk(id: $id) { points results wins winRateBps streak badge predictions correctResults exactScores titles takesListed takesWon backersReceived } }`,
      { id: address.toLowerCase() },
    )
      .then((d) => setP(d.Player_by_pk))
      .catch(() => setP(null));
    Promise.all([
      publicClient.readContract({ address: ADDR.usd, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      publicClient.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    ]).then(([usd, usdc]) => setMoney({ usd, usdc }));
  }, [address]);

  if (status !== "ready" || !address) return <SignIn reason="Your record lives on your passkey. Sign in to see it, on any device." />;

  const stat = (label: string, value: string | number) => (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <>
      <div className="stat-grid">
        {stat("Points", p?.points ?? "0")}
        {stat("Badge", BADGES[p?.badge ?? 0])}
        {stat("Win rate", p?.results ? `${(p.winRateBps / 100).toFixed(0)}%` : "–")}
        {stat("Streak", p ? (p.streak > 0 ? `W${p.streak}` : p.streak < 0 ? `L${-p.streak}` : "–") : "–")}
        {stat("Exact scores", p?.exactScores ?? 0)}
        {stat("Takes that came in", p ? `${p.takesWon}/${p.takesListed}` : "0/0")}
        {stat("Backers", p?.backersReceived ?? 0)}
        {stat("Titles", p?.titles ?? 0)}
      </div>

      <div className="odds-row" style={{ marginTop: 14 }}>
        <a className="cta ghost" href="/challenges">1v1 challenges</a>
        <a className="cta ghost" href="/acca">Accumulators</a>
      </div>

      <div className="section-head"><h3>Wallet</h3></div>
      <p>{money ? `${dollars(money.usd)} dollars · ${dollars(money.usdc)} USDC` : "…"}</p>

      <div className="section-head"><h3>One passkey, many keys</h3></div>
      <p className="muted">
        Everything here comes from your passkey alone. Nothing is stored on this phone: open Terrace on any device, use the same
        passkey, and it all comes back.
      </p>
      <ul className="feed">
        <li className="take"><p className="take-text">Your account</p><p className="take-meta">{address}</p></li>
        <li className="take"><p className="take-text">Your AI agent&apos;s own account</p><p className="take-meta">{keys?.agentAccount.address}</p></li>
        <li className="take"><p className="take-text">Your sealing key</p><p className="take-meta">Seals your private-league picks so you can reveal them from any device</p></li>
        <li className="take"><p className="take-text">Your agent&apos;s memory key</p><p className="take-meta">Encrypts your agent&apos;s notes so only you can read them</p></li>
      </ul>
      <p />
      <button className="link-btn" onClick={logout}>Sign out of this device</button>
    </>
  );
}
