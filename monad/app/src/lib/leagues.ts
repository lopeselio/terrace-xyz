"use client";
import { bytesToHex, decodeAbiParameters, encodeAbiParameters, keccak256, maxUint256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { envelope, openOwn, seal, type SealedPicks } from "@shared/sealed";
import type { useAccount } from "./account";
import { publicClient } from "./chain";
import { erc20Abi, governanceAt, isHouseRules, leaguesAt, NEW_LEAGUES } from "./contracts";
import { query } from "./indexer";
import { sealSalt, type Keys } from "./mera";
import { tokenOf, toUnits, type Money } from "./play";
import { FanError } from "./errors";

type Send = ReturnType<typeof useAccount>["send"];

/** A league's house rules. Leagues made before house rules (v2) play the defaults. */
export type Rules = { exactPoints: number; resultPoints: number; featuredPoints: number; sealedPicks: boolean; jokers: boolean; votingPeriod: number; quorumPct: number };
export const DEFAULT_RULES: Rules = { exactPoints: 3, resultPoints: 1, featuredPoints: 2, sealedPicks: false, jokers: false, votingPeriod: 86_400, quorumPct: 33 };

export async function leagueRules(leagueId: bigint): Promise<Rules> {
  if (!isHouseRules(leagueId)) return DEFAULT_RULES;
  return publicClient.readContract({ ...leaguesAt(leagueId), functionName: "rulesOf", args: [leagueId] });
}

/** Points for an exact score and the right result in a gameweek (fixed when it was added). */
export async function gameweekScoring(contestId: bigint): Promise<{ exact: number; result: number }> {
  if (!isHouseRules(contestId)) return { exact: 3, result: 1 };
  return publicClient.readContract({ ...leaguesAt(contestId), functionName: "scoringOf", args: [contestId] });
}

export const setRules = (send: Send, leagueId: bigint, rules: Rules) => send({ ...leaguesAt(leagueId), functionName: "setRules", args: [leagueId, rules] });

/** The gameweek (contest id) a member put their joker on, or null. */
export async function jokerOf(leagueId: bigint, member: Address): Promise<bigint | null> {
  if (!isHouseRules(leagueId)) return null;
  const v = await publicClient.readContract({ ...leaguesAt(leagueId), functionName: "jokerOf", args: [leagueId, member] });
  return v === 0n ? null : v - 1n;
}
export const playJoker = (send: Send, contestId: bigint) => send({ ...leaguesAt(contestId), functionName: "playJoker", args: [contestId] });

export const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");

export async function createLeague(
  send: Send,
  o: { name: string; gameweeks: number; maxMembers: number; money: Money; entry: number; isPrivate: boolean; governed: boolean; code: string; rules: Rules },
): Promise<bigint> {
  const token = o.entry > 0 ? tokenOf(o.money) : zeroAddress;
  const hash = await send({
    address: NEW_LEAGUES,
    abi: leaguesAt(0).abi,
    functionName: "createLeague",
    args: [o.name, 2026, o.gameweeks, o.maxMembers, token, toUnits(o.entry), o.isPrivate, o.governed, o.code ? keccak256(toBytes(o.code)) : `0x${"0".repeat(64)}`, o.rules],
  });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  // LeagueCreated(uint256 indexed leagueId, ...): the id is the first indexed topic.
  const log = receipt.logs.find((l) => l.address.toLowerCase() === NEW_LEAGUES.toLowerCase());
  return BigInt(log!.topics[1]!);
}

export async function joinLeague(send: Send, owner: Address, leagueId: bigint, code: string) {
  const L = leaguesAt(leagueId);
  const league = await publicClient.readContract({ ...L, functionName: "getLeague", args: [leagueId] });
  // The network drops the contract's reason when a call fails, so check the usual ones first.
  if (league.members.some((m) => m.toLowerCase() === owner.toLowerCase())) throw new FanError("You're already in this league.");
  if (league.members.length >= league.maxMembers) throw new FanError("This league is full.");
  if (league.inviteCodeHash !== `0x${"0".repeat(64)}` && keccak256(toBytes(code)) !== league.inviteCodeHash)
    throw new FanError(code ? "That invite code doesn't match. Check it with whoever invited you." : "This league is invite only: enter the code you were sent.");
  if (league.entryFee > 0n) {
    const allowance = await publicClient.readContract({ address: league.token, abi: erc20Abi, functionName: "allowance", args: [owner, L.address] });
    if (allowance < league.entryFee) await send({ address: league.token, abi: erc20Abi, functionName: "approve", args: [L.address, maxUint256] });
  }
  return send({ ...L, functionName: "joinLeague", args: [leagueId, code], dollars: Number(league.entryFee) / 1e6 });
}

/**
 * Gameweek picks. In sealed contests (every private league) only a commitment and a ciphertext for the
 * CRE reveal key go onchain; the salt comes from the fan's passkey, so they can reveal from any device.
 */
export async function submitPicks(send: Send, keys: Keys, contestId: bigint, sealed: boolean, home: number[], away: number[]) {
  const L = leaguesAt(contestId);
  if (!sealed) return send({ ...L, functionName: "submitPicks", args: [contestId, home, away] });
  const salt = sealSalt(keys, `picks:${L.address}:${contestId}`);
  const commitment = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint8[]" }, { type: "uint8[]" }, { type: "bytes32" }],
      [contestId, keys.account.address, home, away, salt],
    ),
  );
  const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  // Two boxes in one: one for the CRE reveal key, one for the fan's own passkey-derived key, so they
  // can read their sealed picks back on any device while nobody else can.
  const ciphertext = envelope(
    seal(process.env.NEXT_PUBLIC_REVEAL_PUBLIC_KEY as Hex, { v: 1, home, away, salt }, rand),
    seal(keys.selfBoxPublic, { v: 1, home, away, salt }, rand),
  );
  return send({ ...L, functionName: "submitSealedPicks", args: [contestId, commitment, ciphertext] });
}

export const addGameweek = (send: Send, leagueId: bigint, fixtureIds: bigint[]) => send({ ...leaguesAt(leagueId), functionName: "addGameweek", args: [leagueId, fixtureIds] });
export const finalizeGameweek = (send: Send, contestId: bigint) => send({ ...leaguesAt(contestId), functionName: "finalizeContest", args: [contestId] });
export const endSeason = (send: Send, leagueId: bigint) => send({ ...leaguesAt(leagueId), functionName: "endSeason", args: [leagueId] });

export const proposeGameweek = (send: Send, leagueId: bigint, fixtureIds: bigint[]) =>
  send({ ...governanceAt(leagueId), functionName: "propose", args: [leagueId, 0, encodeAbiParameters([{ type: "uint256[]" }], [fixtureIds])] });
export const proposeFeature = (send: Send, leagueId: bigint, marketId: bigint) =>
  send({ ...governanceAt(leagueId), functionName: "propose", args: [leagueId, 1, encodeAbiParameters([{ type: "uint256" }], [marketId])] });
export const proposeRules = (send: Send, leagueId: bigint, rules: Rules) =>
  send({ ...governanceAt(leagueId), functionName: "propose", args: [leagueId, 2, encodeAbiParameters([RULES_TUPLE], [rules])] });
export const vote = (send: Send, proposalId: bigint, support: boolean) => send({ ...governanceAt(proposalId), functionName: "vote", args: [proposalId, support] });
export const executeProposal = (send: Send, proposalId: bigint) => send({ ...governanceAt(proposalId), functionName: "execute", args: [proposalId] });

const RULES_TUPLE = {
  type: "tuple",
  components: [
    { name: "exactPoints", type: "uint8" },
    { name: "resultPoints", type: "uint8" },
    { name: "featuredPoints", type: "uint8" },
    { name: "sealedPicks", type: "bool" },
    { name: "jokers", type: "bool" },
    { name: "votingPeriod", type: "uint32" },
    { name: "quorumPct", type: "uint8" },
  ],
} as const;

/** The rules a "change the house rules" vote proposes. */
export function proposedRules(payload: Hex): Rules | null {
  try {
    return decodeAbiParameters([RULES_TUPLE], payload)[0];
  } catch {
    return null;
  }
}

export async function table(leagueId: bigint, members: readonly Address[]) {
  const scores = await Promise.all(
    members.map((m) => publicClient.readContract({ ...leaguesAt(leagueId), functionName: "seasonScore", args: [leagueId, m] })),
  );
  return members.map((m, i) => ({ member: m, points: Number(scores[i]) })).sort((a, b) => b.points - a.points);
}

/** Gameweek points for every member: final once the gameweek is added up, live otherwise. */
export async function gameweekTable(contestId: bigint, members: readonly Address[], finalized: boolean) {
  const scores = await Promise.all(
    members.map((m) => publicClient.readContract({ ...leaguesAt(contestId), functionName: finalized ? "contestScore" : "currentScore", args: [contestId, m] })),
  );
  return members.map((m, i) => ({ member: m, points: Number(scores[i]) })).sort((a, b) => b.points - a.points);
}

/*
 * League tables also count market wins: backing the right side of a market on one of a finished
 * gameweek's matches is 1 point, and a take the league voted to feature scores the league's featured
 * points (2 unless its house rules say otherwise). Anyone can add them, so one tap after a gameweek is
 * added up counts every member's wins.
 */
export type MarketWin = { gameweek: number; marketId: bigint; member: Address; featured: boolean; points: number };

export async function pendingMarketWins(
  leagueId: bigint,
  members: readonly Address[],
  contests: readonly { fixtureIds: readonly bigint[]; finalized: boolean }[],
): Promise<MarketWin[]> {
  const L = leaguesAt(leagueId);
  const done = contests.map((c, i) => ({ gw: i + 1, c })).filter((x) => x.c.finalized);
  if (!done.length || !members.length) return [];
  const gwOf = new Map<string, number>();
  done.forEach(({ gw, c }) => c.fixtureIds.forEach((f) => gwOf.set(f.toString(), gw)));
  const d = await query<{ Bet: { bettor: string; side: number; market: { id: string; question: { answer: number; fixture: { id: string } | null } } }[] }>(
    `query W($who: [String!]) { Bet(where: { bettor: { _in: $who }, side: { _in: [1, 2] } }, limit: 500) { bettor side market { id question { answer fixture { id } } } } }`,
    { who: members.map((m) => m.toLowerCase()) },
  );
  const won = d.Bet.filter((b) => b.market.question.answer === b.side);
  const out: MarketWin[] = [];
  await Promise.all(
    won.map(async (b) => {
      const marketId = BigInt(b.market.id);
      const member = members.find((m) => m.toLowerCase() === b.bettor.toLowerCase())!;
      const [counted, featured] = await Promise.all([
        publicClient.readContract({ ...L, functionName: "marketWinCounted", args: [leagueId, marketId, member] }),
        publicClient.readContract({ ...L, functionName: "featuredMarket", args: [leagueId, marketId] }),
      ]);
      if (counted) return;
      const gw = gwOf.get(b.market.question.fixture?.id ?? "") ?? (featured ? done[done.length - 1].gw : 0);
      if (!gw) return;
      const points = !featured ? 1 : isHouseRules(leagueId) ? await publicClient.readContract({ ...L, functionName: "featuredPoints", args: [leagueId, marketId] }) : 2;
      out.push({ gameweek: gw, marketId, member, featured, points });
    }),
  );
  return out;
}

export async function countMarketWins(send: Send, leagueId: bigint, wins: MarketWin[]) {
  for (const w of wins) await send({ ...leaguesAt(leagueId), functionName: "countMarketWin", args: [leagueId, w.gameweek, w.marketId, w.member] });
}

/** Markets the league voted to feature (worth the league's featured points to everyone who backed the right side). */
export async function featuredMarkets(leagueId: number) {
  const d = await query<{ FeedItem: { market: { id: string } | null }[] }>(
    `query F($l: String!) { FeedItem(where: { kind: { _eq: "FEATURED" }, league_id: { _eq: $l } }) { market { id } } }`,
    { l: String(leagueId) },
  );
  return new Set(d.FeedItem.flatMap((f) => (f.market ? [f.market.id] : [])));
}

export const hasEntered = (contestId: bigint, player: Address) => publicClient.readContract({ ...leaguesAt(contestId), functionName: "hasEntered", args: [contestId, player] });

export const getPick = (contestId: bigint, player: Address, fixtureId: bigint) =>
  publicClient.readContract({ ...leaguesAt(contestId), functionName: "getPick", args: [contestId, player, fixtureId] });

/*
 * Only a hash of a league's invite code lives onchain, so each device keeps the codes it has seen
 * (made the league, opened an invite link, joined with a code) to put back into every share.
 */
const CODES = "terrace.leagueCodes";
export function rememberCode(leagueId: number | bigint, code: string) {
  if (!code) return;
  try {
    const all = JSON.parse(localStorage.getItem(CODES) || "{}");
    all[String(leagueId)] = code.toUpperCase();
    localStorage.setItem(CODES, JSON.stringify(all));
  } catch {}
}
export function rememberedCode(leagueId: number | bigint): string {
  try {
    return JSON.parse(localStorage.getItem(CODES) || "{}")[String(leagueId)] ?? "";
  } catch {
    return "";
  }
}

/** Your sealed picks, read back from the chain and opened with your passkey (null for older entries). */
export async function ownSealedPicks(keys: Keys, contestId: bigint) {
  const sealed = await publicClient.readContract({ ...leaguesAt(contestId), functionName: "sealedPicks", args: [contestId, keys.account.address] });
  if (!sealed || sealed === "0x") return null;
  return openOwn<SealedPicks>(bytesToHex(keys.selfBoxPrivate), sealed);
}

/** The short code fans share: "L12-ABCD" (league 12, invite code ABCD). */
export const leagueCode = (leagueId: number | bigint, code: string) => `L${leagueId}${code ? `-${code}` : ""}`;

/** Reads "L12-ABCD", "12 ABCD" or a pasted invite link back into a league id and code. */
export function parseInvite(input: string): { leagueId: number; code: string } | null {
  const s = input.trim();
  const link = s.match(/\/l\/(\d+)(?:\?code=([A-Za-z0-9]+))?/);
  if (link) return { leagueId: Number(link[1]), code: (link[2] ?? "").toUpperCase() };
  const short = s.match(/^L?(\d+)(?:[\s-]+([A-Za-z0-9]{3,12}))?$/i);
  if (short) return { leagueId: Number(short[1]), code: (short[2] ?? "").toUpperCase() };
  return null;
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
