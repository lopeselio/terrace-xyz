"use client";
import { encodeAbiParameters, keccak256, maxUint256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { seal } from "@shared/sealed";
import type { useAccount } from "./account";
import { publicClient } from "./chain";
import { ADDR, erc20Abi, governanceAbi, leaguesAbi } from "./contracts";
import { sealSalt, type Keys } from "./mera";
import { tokenOf, toUnits, type Money } from "./play";

type Send = ReturnType<typeof useAccount>["send"];
const L = { address: ADDR.leagues, abi: leaguesAbi } as const;

export const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");

export async function createLeague(
  send: Send,
  o: { name: string; gameweeks: number; maxMembers: number; money: Money; entry: number; isPrivate: boolean; governed: boolean; code: string },
): Promise<bigint> {
  const token = o.entry > 0 ? tokenOf(o.money) : zeroAddress;
  const hash = await send({
    ...L,
    functionName: "createLeague",
    args: [o.name, 2026, o.gameweeks, o.maxMembers, token, toUnits(o.entry), o.isPrivate, o.governed, o.code ? keccak256(toBytes(o.code)) : `0x${"0".repeat(64)}`],
  });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  // LeagueCreated(uint256 indexed leagueId, ...): the id is the first indexed topic.
  const log = receipt.logs.find((l) => l.address.toLowerCase() === ADDR.leagues.toLowerCase());
  return BigInt(log!.topics[1]!);
}

export async function joinLeague(send: Send, owner: Address, leagueId: bigint, code: string) {
  const league = await publicClient.readContract({ ...L, functionName: "getLeague", args: [leagueId] });
  if (league.entryFee > 0n) {
    const allowance = await publicClient.readContract({ address: league.token, abi: erc20Abi, functionName: "allowance", args: [owner, ADDR.leagues] });
    if (allowance < league.entryFee) await send({ address: league.token, abi: erc20Abi, functionName: "approve", args: [ADDR.leagues, maxUint256] });
  }
  return send({ ...L, functionName: "joinLeague", args: [leagueId, code], dollars: Number(league.entryFee) / 1e6 });
}

/**
 * Gameweek picks. In sealed contests (every private league) only a commitment and a ciphertext for the
 * CRE reveal key go onchain; the salt comes from the fan's passkey, so they can reveal from any device.
 */
export async function submitPicks(send: Send, keys: Keys, contestId: bigint, sealed: boolean, home: number[], away: number[]) {
  if (!sealed) return send({ ...L, functionName: "submitPicks", args: [contestId, home, away] });
  const salt = sealSalt(keys, `picks:${ADDR.leagues}:${contestId}`);
  const commitment = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint8[]" }, { type: "uint8[]" }, { type: "bytes32" }],
      [contestId, keys.account.address, home, away, salt],
    ),
  );
  const ciphertext = seal(process.env.NEXT_PUBLIC_REVEAL_PUBLIC_KEY as Hex, { v: 1, home, away, salt }, (n) => crypto.getRandomValues(new Uint8Array(n)));
  return send({ ...L, functionName: "submitSealedPicks", args: [contestId, commitment, ciphertext] });
}

export const addGameweek = (send: Send, leagueId: bigint, fixtureIds: bigint[]) => send({ ...L, functionName: "addGameweek", args: [leagueId, fixtureIds] });
export const finalizeGameweek = (send: Send, contestId: bigint) => send({ ...L, functionName: "finalizeContest", args: [contestId] });
export const endSeason = (send: Send, leagueId: bigint) => send({ ...L, functionName: "endSeason", args: [leagueId] });

const G = { address: ADDR.governance, abi: governanceAbi } as const;
export const proposeGameweek = (send: Send, leagueId: bigint, fixtureIds: bigint[]) =>
  send({ ...G, functionName: "propose", args: [leagueId, 0, encodeAbiParameters([{ type: "uint256[]" }], [fixtureIds])] });
export const proposeFeature = (send: Send, leagueId: bigint, marketId: bigint) =>
  send({ ...G, functionName: "propose", args: [leagueId, 1, encodeAbiParameters([{ type: "uint256" }], [marketId])] });
export const vote = (send: Send, proposalId: bigint, support: boolean) => send({ ...G, functionName: "vote", args: [proposalId, support] });
export const executeProposal = (send: Send, proposalId: bigint) => send({ ...G, functionName: "execute", args: [proposalId] });

export async function table(leagueId: bigint, members: readonly Address[]) {
  const scores = await Promise.all(
    members.map((m) => publicClient.readContract({ ...L, functionName: "seasonScore", args: [leagueId, m] })),
  );
  return members.map((m, i) => ({ member: m, points: Number(scores[i]) })).sort((a, b) => b.points - a.points);
}
