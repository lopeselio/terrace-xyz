# Terrace — Build Backlog

## Sprint 1 — Profile polish ✅
- [x] Show USDC balance (`getTokenAccountsByOwner` devnet USDC mint)
- [x] Show SOL balance (`getBalance`)
- [x] Copy wallet address to clipboard (`expo-clipboard` already installed)
- [x] Show auth method + associated email/Google account (`privyUser.linked_accounts`)
- [x] `.skr` domain / SNS reverse lookup — display alongside wallet address (ref: Bonfida API or `@solana/spl-name-service`)
- [x] Make "-- W" win-rate chip in HomeScreen top nav tappable → navigate to Profile tab

## Sprint 2 — Market UX ✅
- [x] Fix market card titles: prepend event context (`jupiterEventTitle · market.title` e.g. "CL Top Scorer · Viktor Gyokeres")
- [x] Fix 0¢ divide-by-zero in BetSheet max return display (guard `yesPrice >= 0.01`)
- [x] Show Polymarket event image in market cards (`metadata.imageUrl` already in API response)
- [x] Show team/league logos in MatchGroupCard (extend `teamDatabase.ts` with more clubs + use image URLs from Jupiter)
- [x] Fix "-- W" showing before reputation loads (show skeleton/spinner instead)

## Sprint 3 — Permissionless market creation UI
- [x] Create `CreateMarketScreen.tsx` — form: question text, expiry presets, creator fee, public/private toggle, flash toggle
- [x] Wire to native Terrace `create_market` on-chain instruction (`useCreateMarket` hook)
- [x] Show newly created market in Markets tab immediately (`prependMarket` optimistic insert)
- [x] "Create" tab now shows CreateMarketScreen (was ParlayBuilderScreen); navigates to Markets on success
- [x] Market resolution: creator-settles UI — "Created" tab on Profile; YES/NO settle buttons for expired open markets (`useSettleMarket` + `useCreatedMarkets`)

## Sprint 4 — Social feed + follow persistence ✅
- [x] Replace `MOCK_FEED` in SocialScreen with real Helius WebSocket events + historical hydration
- [x] Persist follow relationships in SecureStore (key: `terrace_flw_<walletPubkey>`)
- [x] Filter "Following" feed tab to only show events from followed wallets
- [x] Show empty state on Following tab when not following anyone
- [x] Wire "Follow" buttons in Fans tab to the persisted follow set

## Sprint 5 — Flash contests ✅
- [x] Flash market type: short-lived (15min–90min), starts immediately, no pre-market
- [x] Add `is_flash: true` flag UI in CreateMarketScreen with clamped presets
- [x] Flash markets section on HomeScreen — separate horizontal scroll row, sorted by `expiry ASC`
- [x] Countdown timer on flash market cards (live ticking, mm:ss)
- [x] Telegram bot `/flash` command to create in-match micro-markets — signs with `SOLANA_ADMIN_KEYPAIR_B64` env var

## Sprint 6 — Parlay + market title fix
- [x] In `ParlayBuilderScreen`, show `jupiterEventTitle` above each market outcome label
- [x] Group parlay markets by event in the picker (e.g. "Premier League" → Arsenal, Man City, Liverpool)
- [x] Show parlay multiplier updating live as legs are added
- [x] Profile includes parlay wins/losses in net P&L, win rate, streak, and total counts
- [x] Refresh markets before opening parlay builder so settled markets don't show as Open
- [x] Restrict parlay builder to native Terrace markets only (Jupiter UUIDs aren't valid pubkeys)
- [x] Fix 3-leg parlay submission "An account required by the instruction is missing" — resolved; 2-leg and 3-leg parlays confirmed working in History tab
- [x] Test full parlay submit → on-chain confirmation → show in Profile History tab

## Sprint 7 — Push notifications ✅
- [x] Register Expo push token on app launch (`expo-notifications`)
- [x] Store token against wallet pubkey in Cloudflare Worker KV (`packages/notifications-worker`)
- [x] Trigger push when a followed wallet places a bet (Helius webhook → `/webhook` endpoint on worker)
- [x] Notification tap → navigate to Markets tab and open the market (`addNotificationResponseReceivedListener` in App.tsx)

## Sprint 8 — Creator earnings ✅
- [x] `creator_fee_bps` field exists in Market account — set at creation time via `buildCreateMarketInstruction`
- [x] `claim_winnings` instruction credits `creatorAta` from vault proportionally to fee BPS
- [x] Profile screen shows "Creator fees" stat (estimated from settled volume × fee BPS)

## Sprint 9 — Fan leagues
- [x] League PDA: creator, name, season, gameweek, member_count, entry_fee, prize_pool, vault, is_private, nonce — on-chain (4 instructions: create_league, join_league, record_league_win, advance_gameweek)
- [x] Create league UI: name, invite link (deep link with league address)
- [x] Join league via invite link
- [x] Weekly leaderboard inside league — score = bets won that gameweek
- [x] "Leagues" tab in HomeScreen replacing "coming soon" stub

## Sprint 10 — Matchups (1v1) ✅
- [x] `useMatchup` hook — create, accept, settle, decline; fetches challenger + opponent matchups
- [x] `MatchupScreen` — Create tab (pick market, opponent pubkey, YES/NO, stake), Active tab, Challenges tab
- [x] HomeScreen "Matchups" feature card taps → MatchupScreen overlay (same pattern as Parlay)
- [x] Fix `getProgramAccounts` dataSize filter: program allocates 136 bytes not 123 (had +13 padding) — matchups now visible
- [x] Fix `buildAndSend` missing confirmation polling — refresh was racing the chain; now polls `getSignatureStatuses` before returning
- [x] Fix `MarketNotSettled` (0x1779) misidentified as `InsufficientFunds` (0x1) — substring match replaced with negative-lookahead regex
- [x] Replace blockchain addresses with human-readable content in matchup cards (market question, opponent display name)
- [x] Replace blockchain addresses in HomeScreen "Pending Challenges" panel
- [x] Add USDC balance line to Active + Challenges tabs
- [x] Matchups wired into Profile Active/History tabs (`useMatchup` + `MatchupRow` component; market summaries batch-fetched alongside bets)
- [x] Post-settle fan-focused result banner — win: "BRAGGING RIGHTS: SECURED", loss: "WRONG END OF THE PITCH"; shows winner identity and pot size
- [x] Demote all `console.error` → `console.warn` in transaction hooks (was triggering Expo LogBox red badge with raw hook prefixes)
- [x] `settle-matchups.mjs` admin script — finds all Accepted matchups, settles their markets, settles matchups in one pass
- [x] Profile Active/History tabs: filter chips (All | Bets | Parlays | Matchups) with item counts; parlays + matchups sorted by nonce desc
- [x] Share matchup as deep link → `terrace://matchup/<address>` — challenger taps "Share" on pending card; recipient opens link → Challenges tab opens with card highlighted

## Sprint 11 — Arcium private market UI ✅
- [x] `useCreatedMarkets` exposes `isPrivate` flag on each `CreatedMarket`
- [x] Profile "Created" tab: private Open markets show "Reveal market (Arcium MPC)" button instead of YES/NO settle buttons — calls `revealMarket()` which queues the MPC circuit; Arcium callback auto-settles
- [x] `usePrivateMarket.claimWinnings` no longer requires `outcome` param — reads it from SecureStore JSON alongside the bet secret (stored at bet time)
- [x] `MarketDetailSheet` `PrivateBetPanel`: Settled state shows "Claim private winnings" button for bettors with an unclaimed secret in SecureStore; shows "No unclaimed private bet found" otherwise

## Sprint 12 — Public devnet beta (Rekto-inspired, sequenced)

Sourced from RektoFun competitive review (2026-06-02). Four waves; lower waves block higher waves.

### Wave 1 — Foundation polish (parallel, no blockers)
- [x] **#8 Launch scope: majors, led by EPL + UCL, board seeded from fixtures** — *Scope deliberately widened from the original "one league" premise (2026-08-04 product call).* api-football covers all five majors, so the data argument for narrowing was gone. `COMPETITIONS` now leads with Premier League + Champions League (`FEATURED_COMPETITIONS`) and keeps La Liga, Serie A, Bundesliga, Ligue 1 and Europa League; the dead `World Cup` hot chip is retired to `Internationals` (WC 2026 finished in July — a filter that can only return nothing reads as a broken app). No crypto sidecar: football stays the wedge.
  The board itself is now fixture-led (`hooks/useUpcomingFixtures` + `components/FixtureBoard`, a third "Fixtures" view on the Markets tab). Fixtures come from api-football for the next 7 days across the seeded leagues; markets attach via the existing `matchMarketsToFixtures` matcher; fixtures with no market show a "call it" row that opens Create pre-filled. That last row is the point — a board that only lists what Polymarket prices can't ask a fan to price something.
  10 tests pin the registry (every seedable league has an id, featured leads, ids are correct) — a transposed league id fills the EPL board with another country's fixtures and looks plausible.
  *Unblocks: #2, #6*
- [x] **#11 Counter / Resolving / Expired state badges on market cards** — `utils/marketState.ts` derives one state from status + expiry on cluster time: COUNTER (green countdown, amber inside the last 15 min), RESOLVING (amber, past the deadline and inside a 6h settlement window), EXPIRED (red, past it — nobody settled), SETTLED (grey, with the winning side). `hooks/useMarketState` re-derives as deadlines pass, pacing its own timer (1s while a countdown shows seconds, 30s while it shows hours, none once settled). Rendered by `MarketStateBadge` / `MarketOutcomeLine` on `MarketCard` (Home rows, Markets list, Matchday), `MatchGroupCard`, `MarketDetailSheet` and the swipe deck. Odds now hide whenever the state isn't takeable — the detail sheet's bet panel is gated on it too, so an Open-but-past-deadline market no longer offers a price the program would reject. `UnifiedMarket.outcome` carries the winner through from the Market account. Home's Open/Finished chips filter on takeability rather than raw status. 15 unit tests in `utils/marketState.test.ts` cover the boundaries.
  ⚠️ MatchGroupCard keeps its live scoreline through RESOLVING (a market whose deadline is kick-off is most interesting during the match).
- [x] **#1 Decode on-chain activity into human-readable Live Feed** — Most of this landed with the redesign's identity work: the feed already resolves market questions and renders `@handle` identities. What remained was attribution on the two settle events. `MarketSettled { market, winning_outcome }` and `ParlaySettled { parlay, won }` name an account, not a person, so the feed had a market pubkey in the actor slot labelled "Terrace" — the two most shareable moments in the app were anonymous. `hooks/settleActors.ts` reads the creator back from the account (batched `getMultipleAccounts`, cached for the process, closed accounts remembered as unresolvable) and patches the card in place. Copy stays system-voiced until attribution lands rather than guessing.
  🟠 Worth folding into the next program deploy: add `settler` to `MarketSettled` and `creator` to `ParlaySettled` so new events carry the person directly. The client path stays regardless — every event already on chain needs it.
- [x] **#5 Flexible market expiry picker** — `CreateMarketScreen` now has quick chips (15m / 30m / 1h / 2h / 4h / 8h / 24h / 3d / 7d, clamped to 15m–90m in flash mode) plus **Custom** → days/hours/minutes steppers, bounded 5 min–30 days (15–90 min for flash). Live preview reads "Expires in 3d 19h · Sat 9 Aug, 15:00". Expiry is now computed from cluster time (`serverNow()`), not the device clock, so the on-chain deadline matches what the creator picked.
  ✅ **"Until kick-off" now shipped** — via #8. Coming from a fixture on the matchday board, the kickoff time is simply known, so the chip appears and the deadline defaults to it. The free-text path still has nothing to resolve a kickoff from, which is why the chip is fixture-only.

### Wave 2 — Identity & quality
- [ ] **#2 Email/social onboarding with auto-username + auto-avatar** *(blocked by #8)* — Privy email signup (or stick with Phantom embedded). On first login: (a) random username (adjective+noun+suffix) editable to custom, (b) deterministic avatar (dicebear from wallet), (c) "Top up SOL + USDC" panel with devnet faucet links + copy-to-clipboard address, (d) "you're ready to predict" CTA. Biggest UX gap vs Rekto.
- [ ] **#6 AI statement validator before market creation** *(blocked by #8)* — On Create Market, call Claude Haiku to: (a) classify verifiable / ambiguous / unverifiable, (b) suggest 2–3 cleaner rewordings, (c) inline green/yellow/red badge. Blocks ambiguous markets at creation → easier future AI-oracle resolution → fewer disputes. Mirrors Rekto's "Validate Statement" + "Suggested Valid Statements".
- [ ] **#3 Player profile: W/L stats, badges, follow button** *(blocked by #2)* — Enhance profile with markets created, wins, losses, win%, earnings, rank, badge tier (from Reputation PDA), follow/unfollow (off-chain follow graph in Postgres), grid of recent markets with outcome. Mobile cards should feel tradable. Surface following + follower counts.
- [ ] **#12 Terrace Points (TP) ledger** *(blocked by #2)* — Mirror Rekto: +100 per referred signup, +20 per won market, +10 per lost market (participation), +X per validator vote on AI oracle resolution. Persist per-wallet in off-chain table (Helius webhooks → Postgres). Mainnet path: snapshot TP → seed future token / NFT allocations. Surface points on profile + every win/loss toast.

### Wave 3 — Growth loops
- [ ] **#13 Public leaderboard screen (Wins / Losses / Win% / Earnings)** *(blocked by #12)* — Mobile leaderboard: top stat cards (Markets Created, Total Players, Total USDC Settled, Total Points), sortable list — Rank, Avatar+Username, Wins, Losses, Markets, Win%, Earnings. Cute cards consistent with our brand (not Rekto's pastel). Filter chips: All-time / Season 1 / Weekly.
- [ ] **#4 Referral system with shareable link + Refer Leaderboard** *(blocked by #12, #2)* — `/?ref=<code>` link generator on profile, redeem code field. Rewards: 100 TP per referred signup, bonus 50 TP when referee places first bet, ongoing 5% of their winnings as TP rev share for season. Stat cards: "Friends Referred", "Your TP". Referral Leaderboard tab. Crucial for cold-start on Seeker.
- [ ] **#10 Find Masters / Discover Players grid** *(blocked by #3, #12)* — Discovery surface like Rekto's "Find Masters": grid of player cards with banner color, avatar, username, Markets / Wins / Losses, View Profile + Follow. Filter by category, sort by win%, earnings, or recent activity. Mobile: 2-column grid of taller cards.

### Wave 4 — Differentiation
- [x] **#9 Swipe-based market interaction (Seeker-native)** — Shipped `SwipeDeck.tsx`: Tinder-stack on Home behind a List/Swipe toggle in the Trending → Markets view. right = back YES, left = fade NO, up = open detail, down = skip; tap action bar mirrors the gestures. Card shows crest pair (reuses `TeamBadge`) / event image + statement + YES·NO odds + pool + live countdown, with YES/NO drag stamps. Right/left open `BetSheet` pre-committed to the swiped side (YES green "Back", NO green "Fade"); side + side-priced payout flow through `usePlaceBet` (extended `handleConfirmBet`/`BetSheet` to honour `isYes`). Uses core Animated + PanResponder + `useWindowDimensions` (no reanimated/gesture-handler dep). Verified live on Seeker: both YES and NO paths open the sheet with correct price. Respects source/league filters so "matchday" is one chip away.
- [ ] **#7 AI Oracle resolution UI scaffold** *(blocked by #6, #12)* — Front-end shell before full backend. Tabs: Pending, Resolved, My Votes. Each pending card: market title, evidence sources, Resolve True/False, live validation count (X/threshold), validator sidebar (Total Resolved, Accuracy %, Streak). Confirm modal: "if correct +40 TP, if wrong −20 TP". Gate by badge tier (Reputation PDA), not NFT. 3-hour dispute window UX. Supersedes the "AI oracle" line in Layer 3.

### Divergences from Rekto (deliberate)
- **Swipe-first, not tap-grid** — Seeker-native; Rekto only promises this for Q3.
- **Reputation PDA, not NFT gate** — we have on-chain reputation; their 1500-NFT validator gate is an artificial bottleneck.
- **Tight launch scope** — their empty leaderboard is the cautionary tale.
- **Group-chat framing front and center** — "your group chat takes vanish; here they stay permanent" is our wedge. Rekto's "battle other degens" is generic.

---

## Layer 3 (future)
- [ ] Bonding curve AMM — price moves with volume (Meteora-style), early movers rewarded
- [ ] Leverage layer — borrow against open positions, opt-in risk parameter
- [ ] AI oracle — agent reads match result from sports data API, calls `settle_market` automatically  *(superseded by Sprint 12 #7 for the human-validator scaffold; this remains the autonomous-agent layer)*
- [ ] AI market sentiment feed — per-market conviction analysis surfaced in market detail sheet

## Layer 4 (future)
- [ ] Fantasy overlay — FPL-style squad picks scored on real player stats each gameweek
- [ ] Autonomous AI fan agents — trade markets on user's behalf within set risk limits
- [ ] B2B API — club analytics feeds, brand sentiment markets, white-label SDK
- [ ] Multi-sport expansion — Cricket, F1, NBA after football PMF

## Known bugs
- [x] BetSheet max return shows `$1000.00` when `yesPrice === 0` (division by zero) — fixed
- [x] "-- W" win rate always `null` on HomeScreen top nav even when reputation exists — fixed (ActivityIndicator during load)
- [x] MatchGroupCard team badge images missing for most non-PL clubs — ESPN CDN IDs added for ~30 clubs
- [x] Social "Following" tab shows mock data even when wallet not connected and following nobody — fixed (proper empty states)
- [x] Market titles in Parlay builder and Markets list missing event context prefix — fixed
- [x] Follow relationships reset on app restart (in-memory only) — fixed (SecureStore persistence via useFollowing)
- [x] Settled markets showed in parlay builder (stale cache) — fixed: refresh markets before opening builder
- [x] Matchups not appearing on-chain — `getProgramAccounts` dataSize filter was 123, program allocates 136 — fixed
- [x] Matchups not appearing after creation — no confirmation polling after `sendTransaction` — fixed
- [x] Settle matchup error message said "Insufficient USDC balance" for all Anchor errors — fixed with exact regex
- [x] Expo LogBox showing raw `[useMatchup]` hook logs as red badge notifications — fixed (console.error → console.warn)
- [x] Matchup cards showed raw blockchain addresses instead of market questions / display names — fixed
- [x] Matchups missing from Profile Active and History tabs — `useMatchup` not wired in ProfileScreen — fixed
- [x] 3-leg parlay submit: "An account required by the instruction is missing" — resolved; confirmed working
- [x] "Ping reached timeout" error on Settle matchup — `rpcPost` now retries on ping errors in response body; `confirmTransaction` continues polling through network blips; settle catch treats timeout as ambiguous (refreshes silently) rather than hard error
