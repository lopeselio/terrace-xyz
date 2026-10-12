import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers } from "envio";

const { Addresses } = TestHelpers;
const [alice, bob, carol] = Addresses.mockAddresses;
const usd = "0x00000000000000000000000000000000000000aa";

describe("takes become ranked markets", () => {
  it("a take is posted, backed, listed, bet on and settled", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceChat", event: "MessagePosted", params: { messageId: 1n, roomKind: 0n, roomId: 1557424n, author: alice, replyTo: 0n, text: "Haaland scores before the hour" } },
            { contract: "TerraceChat", event: "TakeBacked", params: { messageId: 1n, backer: bob, backers: 1n } },
            { contract: "TerraceOracle", event: "QuestionCreated", params: { questionId: 1n, fixtureId: 1557424n, kind: 0n, line: 0n, closeTime: 1791732600n, creator: alice, text: "Haaland scores before the hour" } },
            { contract: "TerraceOracle", event: "QuestionSpec", params: { questionId: 1n, spec: `0x${Buffer.from('{"v":1}').toString("hex")}` } },
            { contract: "TerraceMarkets", event: "MarketCreated", params: { marketId: 0n, questionId: 1n, creator: alice, token: usd, feeBps: 300n, sealed_: false, flash: false } },
            { contract: "TerraceMarkets", event: "TakeListed", params: { marketId: 0n, chatRef: 1n, author: alice, questionId: 1n } },
            { contract: "TerraceMarkets", event: "BetPlaced", params: { marketId: 0n, bettor: alice, side: 1n, stake: 10_000_000n } },
            { contract: "TerraceMarkets", event: "BetPlaced", params: { marketId: 0n, bettor: carol, side: 2n, stake: 90_000_000n } },
            { contract: "TerraceMarkets", event: "BetSettled", params: { marketId: 0n, bettor: alice, result: 1n, payout: 97_300_000n, fee: 2_700_000n } },
          ],
        },
      },
    });

    const room = await indexer.Room.getOrThrow("match-1557424");
    t.expect(room.messageCount).toBe(1);

    const message = await indexer.Message.getOrThrow("1");
    t.expect(message.market_id).toBe("0");
    t.expect(message.backers).toBe(1);
    t.expect(message.bettors).toBe(2);
    t.expect(message.volume).toBe(100_000_000n);
    // 1 backer x2 + 2 bettors x3 + log10(101) x4 ≈ 16.0173 (author had no settled takes yet)
    t.expect(Number(message.heat.toString())).toBeCloseTo(16.0173, 3);

    const market = await indexer.Market.getOrThrow("0");
    t.expect(market.yesPool).toBe(10_000_000n);
    t.expect(market.noPool).toBe(90_000_000n);

    const q = await indexer.Question.getOrThrow("1");
    t.expect(q.spec).toBe('{"v":1}');

    const author = await indexer.Player.getOrThrow(alice.toLowerCase());
    t.expect(author.takesListed).toBe(1);
    t.expect(author.takesWon).toBe(1);
    t.expect(author.backersReceived).toBe(1);

    // Terrace Points (x2 while founding fans' Season 0 runs; bob's 112 base gives the multiplier).
    const backer = await indexer.Player.getOrThrow(bob.toLowerCase());
    const m = backer.terracePoints / 112n; // welcome 100 + daily 10 + backed a take 2
    t.expect([1n, 2n]).toContain(m);
    // alice: welcome 100 + daily 10 + take 5 + backed 5 + listed 25 + bet 10+10 + bet on her take 5 + win 20
    t.expect(author.terracePoints).toBe(190n * m);
    // carol: welcome 100 + daily 10 + bet 10 + 25 (stake bonus capped at $25)
    const carolP = await indexer.Player.getOrThrow(carol.toLowerCase());
    t.expect(carolP.terracePoints).toBe(145n * m);
    t.expect(author.dayStreak).toBe(1);
  });

  it("someone else can't list your take as theirs", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceChat", event: "MessagePosted", params: { messageId: 1n, roomKind: 1n, roomId: 3n, author: alice, replyTo: 0n, text: "Bob's picks are cursed" } },
            { contract: "TerraceOracle", event: "QuestionCreated", params: { questionId: 1n, fixtureId: 0n, kind: 0n, line: 0n, closeTime: 1791732600n, creator: bob, text: "x" } },
            { contract: "TerraceMarkets", event: "MarketCreated", params: { marketId: 0n, questionId: 1n, creator: bob, token: usd, feeBps: 0n, sealed_: false, flash: false } },
            { contract: "TerraceMarkets", event: "TakeListed", params: { marketId: 0n, chatRef: 1n, author: bob, questionId: 1n } },
          ],
        },
      },
    });
    const message = await indexer.Message.getOrThrow("1");
    t.expect(message.market_id).toBeUndefined();
    t.expect((await indexer.Room.getOrThrow("league-3")).kind).toBe(1);
  });
});

describe("leagues and records", () => {
  it("tracks members, entries, governance and agent players", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceLeagues", event: "LeagueCreated", params: { leagueId: 1n, creator: alice, name: "The Kop End", season: 2026n, gameweeks: 2n, entryFee: 0n, isPrivate: true } },
            { contract: "TerraceLeagues", event: "LeagueJoined", params: { leagueId: 1n, member: alice } },
            { contract: "TerraceLeagues", event: "LeagueJoined", params: { leagueId: 1n, member: bob } },
            { contract: "TerraceGovernance", event: "Proposed", params: { proposalId: 0n, leagueId: 1n, proposer: bob, kind: 0n, payload: "0x", deadline: 1n } },
            { contract: "TerraceGovernance", event: "Voted", params: { proposalId: 0n, voter: bob, support: true, yes: 1n, no: 0n } },
            { contract: "TerraceGovernance", event: "Resolved", params: { proposalId: 0n, status: 1n } },
            { contract: "TerraceLeagues", event: "ContestCreated", params: { contestId: 0n, creator: bob, leagueId: 1n, prizePool: 0n, entryFee: 0n, lockTime: 1n, sealed_: true } },
            { contract: "TerraceLeagues", event: "GameweekAdded", params: { leagueId: 1n, gameweek: 1n, contestId: 0n } },
            { contract: "TerraceLeagues", event: "SealedPicksSubmitted", params: { contestId: 0n, player: alice, commitment: `0x${"11".repeat(32)}`, ciphertext: "0x01" } },
            { contract: "TerraceLeagues", event: "SealedPicksSubmitted", params: { contestId: 0n, player: alice, commitment: `0x${"22".repeat(32)}`, ciphertext: "0x02" } },
            { contract: "TerraceReputation", event: "AgentRegistered", params: { agent: carol, operator: alice, metadataURI: "ipfs://pundit" } },
            { contract: "TerraceReputation", event: "ResultRecorded", params: { player: carol, source: 0n, won: true, points: 2n, streak: 1n, badge: 0n } },
          ],
        },
      },
    });
    t.expect((await indexer.League.getOrThrow("1")).memberCount).toBe(2);
    t.expect((await indexer.Proposal.getOrThrow("0")).status).toBe(1);
    const contest = await indexer.Contest.getOrThrow("0");
    t.expect(contest.gameweek).toBe(1);
    t.expect(contest.entrants).toBe(1); // re-sealing doesn't double count
    const agent = await indexer.Player.getOrThrow(carol.toLowerCase());
    t.expect(agent.isAgent).toBe(true);
    t.expect(agent.points).toBe(2n);
  });
});

describe("follows", () => {
  it("counts followers and following, and ignores repeats", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceFollows", event: "Followed", params: { follower: alice, followee: bob } },
            { contract: "TerraceFollows", event: "Followed", params: { follower: carol, followee: bob } },
            { contract: "TerraceFollows", event: "Unfollowed", params: { follower: carol, followee: bob } },
          ],
        },
      },
    });
    const b = await indexer.Player.getOrThrow(bob.toLowerCase());
    t.expect(b.followers).toBe(1);
    const a = await indexer.Player.getOrThrow(alice.toLowerCase());
    t.expect(a.following).toBe(1);
    const f = await indexer.Follow.getOrThrow(`${carol.toLowerCase()}-${bob.toLowerCase()}`);
    t.expect(f.active).toBe(false);
  });
});
