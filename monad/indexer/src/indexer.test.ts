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

  it("a group chat take is marked, but the unauthenticated flag earns no extra points", async (t) => {
    const indexer = createTestIndexer();
    const group = (1n << 255n) | 5n;
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceChat", event: "MessagePosted", params: { messageId: 5n, roomKind: 0n, roomId: 1557424n, author: alice, replyTo: 0n, text: "Saka scores Sunday" } },
            { contract: "TerraceOracle", event: "QuestionCreated", params: { questionId: 2n, fixtureId: 1557424n, kind: 0n, line: 0n, closeTime: 1791732600n, creator: alice, text: "Saka scores Sunday" } },
            { contract: "TerraceMarkets", event: "MarketCreated", params: { marketId: 3n, questionId: 2n, creator: alice, token: usd, feeBps: 300n, sealed_: false, flash: false } },
            { contract: "TerraceMarkets", event: "TakeListed", params: { marketId: 3n, chatRef: group, author: alice, questionId: 2n } },
            { contract: "TerraceMarkets", event: "BetPlaced", params: { marketId: 3n, bettor: alice, side: 1n, stake: 5_000_000n } },
            { contract: "TerraceMarkets", event: "BetPlaced", params: { marketId: 3n, bettor: carol, side: 2n, stake: 5_000_000n } },
          ],
        },
      },
    });
    const market = await indexer.Market.getOrThrow("3");
    t.expect(market.take_id).toBe("5");
    t.expect(market.fromGroup).toBe(true);
    const a = await indexer.Player.getOrThrow(alice.toLowerCase());
    t.expect(a.invitesLanded).toBe(0);
    const m = (await indexer.Player.getOrThrow(carol.toLowerCase())).terracePoints / 125n; // welcome 100 + daily 10 + bet 10 + 5
    t.expect([1n, 2n]).toContain(m);
    // alice: welcome 100 + daily 10 + take 5 + listed 25 + bet 10+5 + bet on her take 5
    t.expect(a.terracePoints).toBe(160n * m);
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

describe("sign-ups", () => {
  it("counts a fan's first test-dollar mint as their sign-up and later mints as refills", async (t) => {
    const indexer = createTestIndexer();
    const zero = "0x0000000000000000000000000000000000000000";
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceUSD", event: "Transfer", params: { from: zero, to: alice, value: 100_000_000n } },
            { contract: "TerraceUSD", event: "Transfer", params: { from: alice, to: bob, value: 5_000_000n } },
            { contract: "TerraceUSD", event: "Transfer", params: { from: zero, to: alice, value: 60_000_000n } },
          ],
        },
      },
    });
    const a = await indexer.Signup.getOrThrow(alice.toLowerCase());
    t.expect(a.refills).toBe(1);
    t.expect(a.minted).toBe(160_000_000n);
    t.expect(await indexer.Signup.get(bob.toLowerCase())).toBeUndefined();
  });
});

describe("standard questions", () => {
  it("answers 1X2, goals and both-teams-score from the final score, like TerraceOracle.outcomeOf", async (t) => {
    const indexer = createTestIndexer();
    const q = (questionId: bigint, kind: bigint, line = 0n) =>
      ({ contract: "TerraceOracle", event: "QuestionCreated", params: { questionId, fixtureId: 1557432n, kind, line, closeTime: 1792328400n, creator: alice, text: "" } }) as const;
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            q(1n, 1n), q(2n, 2n), q(3n, 3n), q(4n, 4n, 2n), q(5n, 5n),
            { contract: "TerraceOracle", event: "FixtureSettled", params: { fixtureId: 1557432n, state: 1n, homeGoals: 1n, awayGoals: 1n } },
            q(6n, 4n, 1n), // opened after the result: answered at once
          ],
        },
      },
    });
    const answer = async (id: string) => (await indexer.Question.getOrThrow(id)).answer;
    t.expect([await answer("1"), await answer("2"), await answer("3"), await answer("4"), await answer("5"), await answer("6")]).toEqual([2, 1, 2, 2, 1, 1]);
  });
});

describe("house rules", () => {
  it("a v3 league records its rules, rule changes and jokers", async (t) => {
    const indexer = createTestIndexer();
    const rules = { exactPoints: 5n, resultPoints: 2n, featuredPoints: 3n, sealedPicks: true, jokers: true, votingPeriod: 10_800n, quorumPct: 50n };
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TerraceLeagues", event: "LeagueCreated", params: { leagueId: 1_000_001n, creator: alice, name: "House Rules FC", season: 2026n, gameweeks: 2n, entryFee: 0n, isPrivate: false } },
            { contract: "TerraceLeagues", event: "RulesSet", params: { leagueId: 1_000_001n, rules } },
            { contract: "TerraceLeagues", event: "LeagueJoined", params: { leagueId: 1_000_001n, member: bob } },
            { contract: "TerraceLeagues", event: "ContestCreated", params: { contestId: 1_000_000n, creator: alice, leagueId: 1_000_001n, prizePool: 0n, entryFee: 0n, lockTime: 1791732600n, sealed_: true } },
            { contract: "TerraceLeagues", event: "JokerPlayed", params: { leagueId: 1_000_001n, contestId: 1_000_000n, member: bob } },
            { contract: "TerraceLeagues", event: "RulesSet", params: { leagueId: 1_000_001n, rules: { ...rules, exactPoints: 4n } } },
          ],
        },
      },
    });

    const league = await indexer.League.getOrThrow("1000001");
    t.expect(league.exactPoints).toBe(4);
    t.expect(league.resultPoints).toBe(2);
    t.expect(league.jokers).toBe(true);
    t.expect(league.votingPeriod).toBe(10_800);

    const member = await indexer.LeagueMember.getOrThrow(`1000001-${bob.toLowerCase()}`);
    t.expect(member.jokerContest_id).toBe("1000000");

    // The rules set at creation don't make a feed item; the change after members joined does.
    const items = await indexer.FeedItem.getAll();
    t.expect(items.filter((i) => i.kind === "RULES").length).toBe(1);
  });
});
