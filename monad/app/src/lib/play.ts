"use client";
import { decodeEventLog, maxUint256, parseUnits, stringToHex, type Address } from "viem";
import { publicClient } from "./chain";
import { ADDR, chatAbi, erc20Abi, marketsAbi, YES } from "./contracts";
import type { useAccount } from "./account";

type Send = ReturnType<typeof useAccount>["send"];

export type Money = "usd" | "usdc";
export const tokenOf = (m: Money): Address => (m === "usdc" ? ADDR.usdc : ADDR.usd);
export const toUnits = (dollars: number) => parseUnits(dollars.toString(), 6);

/** First stake with a token: allow the game contract to move it (once, no prompt). */
export async function ensureAllowance(send: Send, owner: Address, token: Address, spender: Address, amount: bigint) {
  const current = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
  if (current >= amount) return;
  await send({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] });
}

/** Posts to a room and returns the new message id (read from the receipt, no indexer wait). */
export async function postMessage(send: Send, roomKind: 0 | 1, roomId: bigint, text: string, replyTo = 0n): Promise<bigint> {
  const hash = await send({ address: ADDR.chat, abi: chatAbi, functionName: "post", args: [roomKind, roomId, text, replyTo] });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: chatAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "MessagePosted") return ev.args.messageId;
    } catch {}
  }
  throw new Error("posted, but couldn't read the message id");
}

export function backTake(send: Send, messageId: bigint) {
  return send({ address: ADDR.chat, abi: chatAbi, functionName: "back", args: [messageId] });
}

export async function listTake(
  send: Send,
  owner: Address,
  t: { messageId: bigint; fixtureId: bigint; closeTime: number; text: string; spec: string; money: Money; dollars: number },
) {
  const token = tokenOf(t.money);
  const stake = toUnits(t.dollars);
  await ensureAllowance(send, owner, token, ADDR.markets, stake);
  return send({
    address: ADDR.markets,
    abi: marketsAbi,
    functionName: "createTakeMarket",
    args: [t.messageId, t.fixtureId, BigInt(t.closeTime), t.text, t.spec ? stringToHex(t.spec) : "0x", token, 300, YES, stake],
    dollars: t.dollars,
  });
}

export async function bet(send: Send, owner: Address, marketId: bigint, token: Address, side: 1 | 2, dollars: number) {
  const stake = toUnits(dollars);
  await ensureAllowance(send, owner, token, ADDR.markets, stake);
  return send({ address: ADDR.markets, abi: marketsAbi, functionName: "placeBet", args: [marketId, side, stake], dollars });
}

export function collect(send: Send, marketId: bigint, bettor: Address) {
  return send({ address: ADDR.markets, abi: marketsAbi, functionName: "settleBet", args: [marketId, bettor] });
}
