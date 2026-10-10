import { NextResponse } from "next/server";
import { isAddress, parseEther, parseUnits, type Address } from "viem";
import { ADDR, erc20Abi, usdAbi } from "@/lib/contracts";
import { serverClient, treasury } from "@/lib/server/rpc";

/**
 * Tops up a new fan so their first pick just works: MON for gas, test dollars, and a little
 * testnet USDC while the treasury has some. Idempotent: anyone already topped up gets nothing.
 * The account's balance is the only state, so it survives restarts and serverless instances.
 */
const GAS_TARGET = parseEther("0.25");
const GAS_TOP_UP_BELOW = parseEther("0.08");
const USD_TARGET = parseUnits("100", 6);
const USDC_GIFT = parseUnits("2", 6);

// Light abuse guard per server instance: a handful of new accounts per IP per hour.
const recent = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 6) return false;
  recent.set(ip, [...hits, now]);
  return true;
}

export async function POST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  const fan = address as Address;
  const [gas, usd, usdc] = await Promise.all([
    serverClient.getBalance({ address: fan }),
    serverClient.readContract({ address: ADDR.usd, abi: erc20Abi, functionName: "balanceOf", args: [fan] }),
    serverClient.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "balanceOf", args: [fan] }),
  ]);
  const needs = { gas: gas < GAS_TOP_UP_BELOW, usd: usd < USD_TARGET / 2n, usdc: usdc === 0n };
  if (!needs.gas && !needs.usd && !needs.usdc) return NextResponse.json({ ok: true, topUp: false });
  if (!allow(ip)) return NextResponse.json({ error: "slow down" }, { status: 429 });

  const { account, wallet } = treasury();
  const sent: string[] = [];
  if (needs.gas) {
    await wallet.sendTransaction({ to: fan, value: GAS_TARGET - gas });
    sent.push("gas");
  }
  if (needs.usd) {
    await wallet.writeContract({ address: ADDR.usd, abi: usdAbi, functionName: "mint", args: [fan, USD_TARGET - usd] });
    sent.push("usd");
  }
  if (needs.usdc) {
    const left = await serverClient.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    if (left >= USDC_GIFT) {
      await wallet.writeContract({
        address: ADDR.usdc,
        abi: [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
        functionName: "transfer",
        args: [fan, USDC_GIFT],
      });
      sent.push("usdc");
    }
  }
  return NextResponse.json({ ok: true, topUp: true, sent });
}
