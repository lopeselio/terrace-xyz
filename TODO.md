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
- [ ] League PDA: creator, name, member pubkeys[], weekly_scores, season
- [ ] Create league UI: name, invite link (deep link with league address)
- [ ] Join league via invite link
- [ ] Weekly leaderboard inside league — score = bets won that gameweek
- [ ] "Leagues" tab in HomeScreen replacing "coming soon" stub

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

## Layer 3 (future)
- [ ] Bonding curve AMM — price moves with volume (Meteora-style), early movers rewarded
- [ ] Leverage layer — borrow against open positions, opt-in risk parameter
- [ ] AI oracle — agent reads match result from sports data API, calls `settle_market` automatically
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
- [ ] "Ping reached timeout" error on Settle matchup — keepalive/WebSocket issue on devnet, needs investigation
