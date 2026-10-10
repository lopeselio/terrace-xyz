import { parseAbi, type Address } from "viem";
import deployment from "@deployments/10143.json";

const c = deployment.contracts as Record<string, Address>;

export const ADDR = {
  usd: c.TerraceUSD,
  usdc: deployment.settlementTokens.USDC as Address,
  oracle: c.TerraceOracle,
  reputation: c.TerraceReputation,
  markets: c.TerraceMarkets,
  parlays: c.TerraceParlays,
  matchups: c.TerraceMatchups,
  leagues: c.TerraceLeagues,
  governance: c.TerraceGovernance,
  chat: c.TerraceChat,
} as const;

/** Answer and side codes shared with the contracts. */
export const YES = 1;
export const NO = 2;

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const usdAbi = parseAbi(["function claim()", "function mint(address to, uint256 amount)"]);

export const oracleAbi = parseAbi([
  "function standardQuestion(uint256 fixtureId, uint8 kind, uint8 line) returns (uint256)",
  "function standardQuestionId(bytes32 key) view returns (uint256)",
  "function outcomeOf(uint256 questionId) view returns (uint8)",
  "function closeTimeOf(uint256 questionId) view returns (uint64)",
  "function fixtureResult(uint256 fixtureId) view returns (uint8 state, uint8 homeGoals, uint8 awayGoals)",
  "function fixtureKickoff(uint256 fixtureId) view returns (uint64)",
  "function fixtureIds() view returns (uint256[])",
]);

export const marketsAbi = parseAbi([
  "function createMarket(uint256 questionId, address token, uint16 feeBps, bool sealed_, bool flash) returns (uint256)",
  "function createTakeMarket(uint256 chatRef, uint256 fixtureId, uint64 closeTime, string text, bytes spec, address token, uint16 feeBps, uint8 side, uint256 stake) returns (uint256)",
  "function placeBet(uint256 marketId, uint8 side, uint256 stake)",
  "function placeSealedBet(uint256 marketId, uint256 stake, bytes32 commitment, bytes ciphertext)",
  "function revealOwn(uint256 marketId, uint8 side, bytes32 salt)",
  "function settleBet(uint256 marketId, address bettor) returns (uint256)",
  "function commitmentFor(uint256 marketId, address bettor, uint8 side, bytes32 salt) pure returns (bytes32)",
  "event TakeListed(uint256 indexed marketId, uint256 indexed chatRef, address indexed author, uint256 questionId)",
  "event MarketCreated(uint256 indexed marketId, uint256 indexed questionId, address indexed creator, address token, uint16 feeBps, bool sealed_, bool flash)",
]);

export const chatAbi = parseAbi([
  "function post(uint8 roomKind, uint256 roomId, string text, uint256 replyTo) returns (uint256)",
  "function back(uint256 messageId)",
  "event MessagePosted(uint256 indexed messageId, uint8 indexed roomKind, uint256 indexed roomId, address author, uint256 replyTo, string text)",
]);

export const matchupsAbi = parseAbi([
  "function challenge(address opponent, uint256 questionId, uint8 side, address token, uint256 stake) returns (uint256)",
  "function accept(uint256 matchupId)",
  "function decline(uint256 matchupId)",
  "function settle(uint256 matchupId)",
  "function getMatchup(uint256 matchupId) view returns ((address challenger, address opponent, uint256 questionId, address token, uint128 stake, uint8 challengerSide, uint8 status, address winner))",
  "event MatchupCreated(uint256 indexed matchupId, address indexed challenger, address indexed opponent, uint256 questionId, uint8 challengerSide, address token, uint256 stake)",
]);

export const leaguesAbi = parseAbi([
  "function createLeague(string name, uint16 season, uint8 gameweeks, uint8 maxMembers, address token, uint256 entryFee, bool isPrivate, bool governed, bytes32 inviteCodeHash) returns (uint256)",
  "function joinLeague(uint256 leagueId, string inviteCode)",
  "function submitPicks(uint256 contestId, uint8[] home, uint8[] away)",
  "function submitSealedPicks(uint256 contestId, bytes32 commitment, bytes ciphertext)",
  "function picksCommitment(uint256 contestId, address player, uint8[] home, uint8[] away, bytes32 salt) pure returns (bytes32)",
  "function isMember(uint256 leagueId, address member) view returns (bool)",
  "function seasonScore(uint256 leagueId, address member) view returns (uint256)",
  "function contestScore(uint256 contestId, address player) view returns (uint256)",
  "function currentScore(uint256 contestId, address player) view returns (uint256)",
  "event LeagueCreated(uint256 indexed leagueId, address indexed creator, string name, uint16 season, uint8 gameweeks, uint256 entryFee, bool isPrivate)",
]);

export const governanceAbi = parseAbi([
  "function propose(uint256 leagueId, uint8 kind, bytes payload) returns (uint256)",
  "function vote(uint256 proposalId, bool support)",
  "function execute(uint256 proposalId)",
]);

export const reputationAbi = parseAbi([
  "function registerAgent(address operator, string metadataURI)",
]);
