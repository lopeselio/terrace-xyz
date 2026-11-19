/** Terrace Points, as the indexer awards them (monad/indexer/src/points.ts). Rewards for playing; no cash value. */
export const SEASON0_END = 1796083200; // 1 Dec 2026 00:00 UTC: founding fans earn double through 30 Nov
export const foundingFans = () => Date.now() / 1000 < SEASON0_END;

export const EARN: { reason: string; label: string; points: number; note?: string }[] = [
  { reason: "WELCOME", label: "Join Terrace", points: 100, note: "lands with your first bet or take" },
  { reason: "DAILY", label: "Play on a new day", points: 10, note: "+30 on a 3-day run, +100 on a 7-day run" },
  { reason: "BET", label: "Place a bet", points: 10, note: "+1 per dollar staked, up to 25" },
  { reason: "WIN", label: "A bet comes in", points: 20 },
  { reason: "TAKE", label: "Post a take in the chat", points: 5, note: "first 10 a day" },
  { reason: "TAKE_LISTED", label: "Your take becomes a market", points: 25 },
  { reason: "CHAT_MARKET", label: "Your group chat's take becomes a market", points: 25, note: "through the Terrace bot" },
  { reason: "TAKE_BACKED", label: "Someone backs your take", points: 5 },
  { reason: "BET_ON_YOUR_TAKE", label: "Someone bets on your take", points: 5 },
  { reason: "CHALLENGE", label: "Send a 1v1", points: 15 },
  { reason: "CHALLENGE_TAKEN", label: "A mate takes your 1v1 on", points: 25 },
  { reason: "PARLAY", label: "Place a parlay", points: 5, note: "per leg" },
  { reason: "LEAGUE_CREATED", label: "Start a league", points: 50 },
  { reason: "LEAGUE_JOINED", label: "Join a league", points: 25 },
  { reason: "PICKS", label: "Make your gameweek picks", points: 15 },
  { reason: "VOTE", label: "Vote in your league", points: 5 },
  { reason: "INVITE", label: "Bring a new fan in", points: 100, note: "through your 1v1, league link or group chat take" },
];

const LABEL: Record<string, string> = {
  ...Object.fromEntries(EARN.map((e) => [e.reason, e.label])),
  STREAK_3: "3-day run",
  STREAK_7: "7-day run",
  BACKED_A_TAKE: "Backed a take",
  CHALLENGE_ACCEPTED: "Took on a 1v1",
  LEAGUE_MEMBER: "A fan joined your league",
  PROPOSAL: "Proposed a vote",
};
export const reasonLabel = (r: string) => LABEL[r] ?? "Terrace Points";

export const points = (n: string | number | bigint) => Number(n).toLocaleString("en-US");
