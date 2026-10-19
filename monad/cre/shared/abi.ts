/** Minimal ABIs for what the Terrace workflows read on Monad. */
import { parseAbi } from "viem";

export const ORACLE_ABI = parseAbi([
  "function simNonce() view returns (uint256)",
  "function pendingFixtures() view returns (uint256[])",
  "function pendingQuestions() view returns (uint256[])",
  "function fixtureIds() view returns (uint256[])",
  "function fixtureKickoff(uint256 fixtureId) view returns (uint64)",
  "function fixtureResult(uint256 fixtureId) view returns (uint8 state, uint8 homeGoals, uint8 awayGoals)",
  "function getQuestion(uint256 questionId) view returns ((uint256 fixtureId, uint64 closeTime, uint8 kind, uint8 line, uint8 answer, address creator, string text, bytes spec))",
  "function closeTimeOf(uint256 questionId) view returns (uint64)",
]);

export const MARKETS_ABI = parseAbi([
  "function marketCount() view returns (uint256)",
  "function closeTimeOf(uint256 marketId) view returns (uint64)",
  "function unrevealedBettors(uint256 marketId) view returns (address[])",
  "function sealedCiphertext(uint256 marketId, address bettor) view returns (bytes)",
]);

export const LEAGUES_ABI = parseAbi([
  "function contestCount() view returns (uint256)",
  "function revealOpen(uint256 contestId) view returns (bool)",
  "function revealDeadline(uint256 contestId) view returns (uint256)",
  "function unrevealedPlayers(uint256 contestId) view returns (address[])",
  "function sealedPicks(uint256 contestId, address player) view returns (bytes)",
]);

/** Report kinds understood by TerraceOracle (1-3) and its handlers (16+). */
export const REPORT = {
  FIXTURES: 1,
  RESULTS: 2,
  ANSWERS: 3,
  REVEAL_BETS: 16,
  REVEAL_PICKS: 17, // v2 leagues; each leagues deployment has its own kind (reveal config)
} as const;

/** Answer codes shared with the contracts. */
export const ANSWER = { OPEN: 0, YES: 1, NO: 2, VOID: 3 } as const;

/** Fixture result states shared with the contracts. */
export const FIXTURE = { PENDING: 0, FINAL: 1, VOID: 2 } as const;
