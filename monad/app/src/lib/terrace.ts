import { type Address } from "viem";
import { leaguesAbi } from "./abi";
import { LEAGUES_ADDRESS, publicClient } from "./chain";

const base = { address: LEAGUES_ADDRESS, abi: leaguesAbi } as const;

export type Fixture = { id: bigint; kickoff: number; settled: boolean; homeGoals: number; awayGoals: number };
export type Contest = {
  id: bigint;
  creator: Address;
  prizeToken: Address;
  prizePool: bigint;
  lockTime: number;
  finalized: boolean;
  fixtureIds: readonly bigint[];
  entrants: readonly Address[];
};

export async function getContest(id: bigint): Promise<Contest> {
  const [creator, prizeToken, prizePool, lockTime, finalized, fixtureIds, entrants] = await publicClient.readContract({
    ...base,
    functionName: "getContest",
    args: [id],
  });
  return { id, creator, prizeToken, prizePool, lockTime: Number(lockTime), finalized, fixtureIds, entrants };
}

export async function getFixtures(ids: readonly bigint[]): Promise<Fixture[]> {
  return Promise.all(
    ids.map(async (id) => {
      const [kickoff, , settled, homeGoals, awayGoals] = await publicClient.readContract({
        ...base,
        functionName: "fixtures",
        args: [id],
      });
      return { id, kickoff: Number(kickoff), settled, homeGoals, awayGoals };
    }),
  );
}

export async function getMyPicks(contestId: bigint, player: Address, ids: readonly bigint[]) {
  return Promise.all(
    ids.map((fid) =>
      publicClient.readContract({ ...base, functionName: "getPrediction", args: [contestId, player, fid] }),
    ),
  );
}

export async function getLeaderboard(contest: Contest) {
  const rows = await Promise.all(
    contest.entrants.map(async (player) => ({
      player,
      points: Number(
        await publicClient.readContract({ ...base, functionName: "currentScore", args: [contest.id, player] }),
      ),
    })),
  );
  return rows.sort((a, b) => b.points - a.points);
}

export async function getRecentContests(limit = 10): Promise<Contest[]> {
  const count = await publicClient.readContract({ ...base, functionName: "contestCount" });
  const ids: bigint[] = [];
  for (let i = count - 1n; i >= 0n && ids.length < limit; i--) ids.push(i);
  return Promise.all(ids.map(getContest));
}

export async function getReputation(player: Address) {
  const r = await publicClient.readContract({ ...base, functionName: "reputation", args: [player] });
  const [contestsPlayed, contestsWon, predictions, correctResults, exactScores, currentStreak, bestStreak, points] = r;
  return { contestsPlayed, contestsWon, predictions, correctResults, exactScores, currentStreak, bestStreak, points: Number(points) };
}

/** Plain-language messages for contract errors. Never show raw revert data to fans. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ContestLocked")) return "Picks are closed. This challenge has kicked off.";
  if (msg.includes("ContestFull")) return "This challenge is full.";
  if (msg.includes("UnknownFixture")) return "One of those matches isn't available yet.";
  if (msg.includes("NotReady")) return "Results aren't in for every match yet.";
  if (msg.includes("AlreadyFinalized")) return "This challenge has already been settled.";
  if (msg.toLowerCase().includes("user rejected")) return "Cancelled. Your picks weren't saved.";
  return "Something went wrong saving that. Check your connection and try again.";
}

export function shortName(addr: Address, me?: Address) {
  if (me && addr.toLowerCase() === me.toLowerCase()) return "You";
  return `Fan ${addr.slice(2, 6).toUpperCase()}`;
}

export function kickoffLabel(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
