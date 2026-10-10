"use client";
import { decodeEventLog, encodeAbiParameters, keccak256, zeroAddress, type Address } from "viem";
import type { useAccount } from "./account";
import { publicClient } from "./chain";
import { ADDR, matchupsAbi, oracleAbi, parlaysAbi } from "./contracts";
import { ensureAllowance, toUnits } from "./play";

type Send = ReturnType<typeof useAccount>["send"];

/** Oracle standard question kinds. */
export const KIND = { HOME: 1, DRAW: 2, AWAY: 3, OVER: 4, BTTS: 5 } as const;

/** Find (or create, once) the oracle question "home win / draw / away win…" for a match. */
export async function standardQuestion(send: Send, fixtureId: number, kind: number, line = 0): Promise<bigint> {
  const key = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint8" }, { type: "uint8" }], [BigInt(fixtureId), kind, kind === KIND.OVER ? line : 0]));
  const existing = await publicClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "standardQuestionId", args: [key] });
  if (existing !== 0n) return existing;
  await send({ address: ADDR.oracle, abi: oracleAbi, functionName: "standardQuestion", args: [BigInt(fixtureId), kind, kind === KIND.OVER ? line : 0] });
  return publicClient.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "standardQuestionId", args: [key] });
}

// ---- 1v1 challenges ----------------------------------------------------------

/** An open challenge (anyone with the link can take the other side). Returns the challenge id. */
export async function challenge(send: Send, owner: Address, questionId: bigint, side: 1 | 2, token: Address, dollars: number): Promise<bigint> {
  const stake = toUnits(dollars);
  await ensureAllowance(send, owner, token, ADDR.matchups, stake);
  const hash = await send({ address: ADDR.matchups, abi: matchupsAbi, functionName: "challenge", args: [zeroAddress, questionId, side, token, stake], dollars });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: matchupsAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "MatchupCreated") return ev.args.matchupId;
    } catch {}
  }
  throw new Error("challenge sent, but couldn't read its id");
}

export async function acceptChallenge(send: Send, owner: Address, matchupId: bigint) {
  const m = await publicClient.readContract({ address: ADDR.matchups, abi: matchupsAbi, functionName: "getMatchup", args: [matchupId] });
  await ensureAllowance(send, owner, m.token, ADDR.matchups, m.stake);
  return send({ address: ADDR.matchups, abi: matchupsAbi, functionName: "accept", args: [matchupId], dollars: Number(m.stake) / 1e6 });
}
export const settleChallenge = (send: Send, id: bigint) => send({ address: ADDR.matchups, abi: matchupsAbi, functionName: "settle", args: [id] });
export const callOffChallenge = (send: Send, id: bigint) => send({ address: ADDR.matchups, abi: matchupsAbi, functionName: "decline", args: [id] });
export const expireChallenge = (send: Send, id: bigint) => send({ address: ADDR.matchups, abi: matchupsAbi, functionName: "expire", args: [id] });

// ---- Accumulators --------------------------------------------------------------

export type Leg = { questionId: bigint; side: 1 | 2 };

export async function placeAcca(send: Send, owner: Address, legs: Leg[], token: Address, dollars: number) {
  const stake = toUnits(dollars);
  await ensureAllowance(send, owner, token, ADDR.parlays, stake);
  return send({ address: ADDR.parlays, abi: parlaysAbi, functionName: "placeParlay", args: [legs, token, stake], dollars });
}
export const settleAcca = (send: Send, id: bigint) => send({ address: ADDR.parlays, abi: parlaysAbi, functionName: "settleParlay", args: [id] });
export const claimAcca = (send: Send, id: bigint) => send({ address: ADDR.parlays, abi: parlaysAbi, functionName: "claim", args: [id] });
