# Terrace

On-chain football prediction markets on Solana (devnet). Public matchups, 1v1 challenges, parlays, **private fan leagues with encrypted scores via Arcium MPC**, and a live notification fabric that surfaces every move your league-mates make.

## Stack

- **Program** — Anchor 0.30, Solana devnet (program id `8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF`)
- **Client** — React Native + Expo SDK 54, ships to Seeker via the Solana Mobile dApp Store
- **Wallet** — Privy embedded wallet (email / Google) + Mobile Wallet Adapter (Seeker Seed Vault)
- **Confidential compute** — Arcium MPC for private market reveal + private league scoring
- **RPC** — Helius (devnet) + Helius WebSocket subscriptions for live events
- **Settlement token** — devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)
- **Off-chain infra** — Cloudflare Worker for push fan-out + Telegram wallet linking; Expo Push for OS notifications

---

## Player Profile

Every wallet has two independent roles: **market creator** and **bettor**. The Profile screen surfaces both.

### Tabs

| Tab | What it shows |
|-----|---------------|
| **Active** | Bets you've placed that haven't been claimed yet (`claimed = false`) |
| **History** | Bets you've claimed + bets on settled markets where you picked the losing side |
| **Created** | Markets you deployed — with YES/NO settle buttons while status is Open |

---

## Reputation System

Reputation is stored in a **Reputation PDA** keyed to your wallet. It is updated exclusively by on-chain instructions — the UI reads it directly from the account.

### How stats move

```
Place bet (Back YES / NO on any open market)
        ↓
Bet PDA created on-chain  →  appears in Active tab
        ↓
Market creator settles the market
        ↓
  ┌─────────────────────┐          ┌──────────────────────────┐
  │  You picked the     │          │  You picked the          │
  │  WINNING side       │          │  LOSING side             │
  └──────────┬──────────┘          └────────────┬─────────────┘
             │                                   │
    "Claim winnings" button              record_loss instruction
    appears in Active tab                moves bet to History,
             │                           decrements streak
    Tap → USDC paid out
    Bet moves to History
    Reputation PDA updated
```

### Instruction → reputation effect

| On-chain instruction | Effect on Reputation PDA |
|----------------------|--------------------------|
| `claim_winnings` | `winning_bets + 1`, `total_bets + 1`, `win_rate_bps` recalculated, `current_streak + 1` |
| `record_loss` | `total_bets + 1`, streak resets / goes negative |

### Badge tiers

| Win rate | Badge |
|----------|-------|
| < 50% | Casual 🎯 |
| ≥ 50% | Sharp ⚡ |
| ≥ 70% | Legend 👑 |

Badges are computed client-side from `win_rate_bps` read off the Reputation PDA. They update live on the Profile screen after every claim.

---

## Market Lifecycle

```
create_market (creator)
      ↓ status: Open
place_bet (any bettor)      ← adds volume, creates Bet PDA
      ↓
settle_market (creator)     ← picks outcome 0=YES / 1=NO
      ↓ status: Settled
claim_winnings (winning bettors)   ← USDC out, Reputation updated
record_loss    (losing bettors)    ← Reputation updated, no payout
```

### Market types

| Type | Expiry window | Use case |
|------|--------------|----------|
| Standard | +1h / +4h / +24h / +7d | Pre-match, season-long |
| Flash | +15m / +30m / +60m / +90m | In-match (next goal, MOTM, etc.) |

Both types follow the same on-chain lifecycle. Flash markets have `is_flash = true` in the Market account.

---

## Private Fan Leagues (Arcium MPC)

Fantasy-style competition layered on top of the regular betting flow. Friends create a league, place bets through the gameweek, and scores stay **encrypted on-chain through Arcium's MPC network** until the gameweek ends and each member chooses to reveal.

### Lifecycle

```
create_league  (any wallet)                                     ┐
   ↓ status: Active, gameweek: 1                                │
join_league    (members)         ──→  init_member_score (Arcium)│ private
   ↓                                                            │ leagues:
record_league_win (bet wins counted toward GW score)            │ score is
   • public league  → LeagueMember.gameweek_score++             │ encrypted
   • private league → MXE-encrypted increment_member_score      │ MXE state
   ↓                                                            │
advance_gameweek (creator) — bumps League.gameweek              │
   ↓                                                            │
reveal_member_score (Arcium reveal MPC circuit)                 │
   • MXE decrypts → callback writes plaintext to LeagueMember   │
   • Seen as "🎉 You scored N points" celebration on device     │
   ↓                                                            │
reset_member_score (re-initialises encrypted slot to 0 for GW+1)┘
```

### What's encrypted vs. plaintext

| Field | State |
|---|---|
| Individual gameweek score (private league) | Encrypted in `PrivateMemberScore` until the member chooses to reveal |
| Revealed score (after the Arcium callback lands) | Plaintext on the `LeagueMember` PDA — anyone can read it |
| Total cumulative score | Plaintext — used for the leaderboard once members start revealing |
| Public-league scores | Plaintext throughout — no MPC overhead |

### Reveal UX (client)

`useLeague.pollMemberScoreRevealed()` polls `PrivateMemberScore.is_revealed` every 2 s for up to 90 s after submitting `reveal_member_score`. If the Arcium callback lands → success toast, confetti, leaderboard refresh, off-chain per-GW history snapshot. If it doesn't land → an in-app toast with a **Retry reveal** action so the user is never stuck on a stale spinner.

The off-chain history index (`SecureStore` keyed `terrace:gw-history:{league}`) captures every `(member, gameweek, score)` tuple seen via `loadLeaderboard`, since the on-chain `LeagueMember` only carries the **most recent** revealed slot before the next GW's first win lazy-resets it. Rendered as `GW1 · 2 / GW2 · 4` chips under each member on the leaderboard.

---

## Important notes

- **Creator ≠ Bettor for reputation purposes.** Settling a market you created does not affect your Reputation PDA. Only placing bets and then claiming/losing does.
- **`settle_market` has no on-chain expiry check.** Creators can settle any Open market at any time — the UI shows settle buttons for all Open markets regardless of expiry.
- **`claim_winnings` requires the market creator address.** The UI fetches this from the Market account via `getAccountInfo` before building the transaction.
- **Reputation PDA is created lazily** on the first `claim_winnings` or `record_loss` call for a wallet.

---

## Program accounts

| Account | Seeds | Key fields |
|---------|-------|-----------|
| `Market` | `[b"market", creator, nonce_le]` | question, expiry, creator, outcome, total_volume, status, is_flash, is_private |
| `Bet` | `[b"bet", market, bettor]` | outcome, amount, claimed, result_recorded |
| `Reputation` | `[b"reputation", owner]` | total_bets, winning_bets, win_rate_bps, current_streak, badge_tier |
| `Parlay` | `[b"parlay", owner, nonce_le]` | legs[], stake_usdc, status |
| `Matchup` | `[b"matchup", challenger, nonce_le]` | market, challenger, opponent, stake, challenger_outcome, status |
| `League` | `[b"league", creator, nonce_le]` | name, season, gameweek, member_count, max_members, is_private, entry_fee_usdc, prize_pool, vault, status |
| `LeagueMember` | `[b"league_member", league, member]` | gameweek_score, total_score, last_scored_gameweek, member_slot |
| `PrivateMemberScore` | `[b"member_score", league, member]` | encrypted_score `[u8;32]`, nonce u128, scores_gameweek, is_revealed |
| `LeagueScoreRecord` | `[b"league_score", league, member, bet]` | marker PDA — existence prevents double-scoring the same bet |

---

## Real-time notifications

Three independent layers feed the bell icon on Home + the device notification shade.

### Sources

| Source | Drives | Storage |
|---|---|---|
| **On-chain polling** (`useLeagueAdvanceNotifications`) | "League advanced to GW N — reveal your score" | SecureStore `last-seen` per (wallet, league) |
| **On-chain polling** (`useLeagueWinnerNotifications`) | "X won GW N in Y league" — fires once every member has revealed for a completed GW | SecureStore `seen` per (league, gw) |
| **Push fan-out** (Cloudflare Worker → Expo Push) | Real-time alerts when a league-mate joins / wins / advances / reveals / creates a market | AsyncStorage activity log (`useLeagueActivityFeed`), capped at 40 entries, deduped by notification id |

### Worker endpoints used by the app

| Endpoint | Purpose |
|---|---|
| `POST /register` | Register Expo push token + follow graph |
| `POST /league-register` | Sync the user's league membership into the worker's KV indexes (`member_leagues:{pubkey}` ↔ `league_members:{league}`) |
| `POST /league-event` | Fan-out a push to every member of one league (join / win / advance / reveal) |
| `POST /league-event-broadcast` | Fan-out across **every** league the actor belongs to — used when the create-market screen doesn't know the leagues (e.g. `market_create`) |
| `POST /webhook` | Helius enhanced-tx webhook → fan-out to followers of the actor |

### Confetti + haptic cues

`utils/cues.ts` centralises `expo-haptics` calls (`cueSuccess`, `cueError`, `cueWin`, `cueTap`, `cueSubmit`) so every win moment fires a consistent two-stage taptic burst. `Confetti.tsx` is a dependency-free RN Animated component that fires at three sites: the league reveal celebration, matchup "Bragging Rights" banner, and bet/parlay claim success. Toast variants use a circular tinted icon badge with a spring scale-in on appear and on kind promote (loading → success/error).

> Audio cues are scaffolded via `expo-av` but the sound assets aren't wired yet. Drop `win.mp3` / `error.mp3` / `tap.mp3` into `packages/app/src/assets/sounds/` and the `cues` helper will start playing them automatically.

---

## Integrations

### Arcium MPC

Two distinct surfaces use Arcium for confidential compute on-chain.

#### 1. Private markets (encrypted bets)

Encrypted bet placement uses X25519 ECDH against the MXE's pubkey — ephemeral keypair generated per bet, outcome + amount XOR-encrypted field-by-field. A `blake3(outcome_byte || secret_32_bytes)` commitment is stored on-chain; the secret is persisted to `expo-secure-store` keyed by the `privateBetRecord` PDA so `claimWinnings` needs no outcome param.

Three computation definitions: `init_private_market_state`, `place_private_bet`, `reveal_private_market`. Registered via `packages/programs/scripts/init-arcium-comp-defs.ts`. The `usePrivateMarket` hook covers the full flow: `placeBet` → `revealMarket` (queues MPC circuit) → `claimWinnings`. The `revealMarket` MPC callback auto-settles the market when it lands.

UI surface: `ArciumBadge`, `ArciumPrivacyBanner`, `ArciumSettledBanner`; `PrivateBetPanel` in `MarketDetailSheet`; "Reveal market (Arcium MPC)" button in Profile → Created tab.

#### 2. Private fan leagues (encrypted gameweek scores)

Four computation definitions backing the league lifecycle: `init_member_score`, `increment_member_score`, `reveal_member_score`, and an `init_member_score_v2` callback wired to `reset_member_score` for re-initialising the encrypted slot at GW boundaries.

End-to-end client flow lives in `useLeague`:
- `joinLeague` → `initMemberScore` (creates the encrypted `PrivateMemberScore` PDA)
- `recordWin` → queues `increment_member_score` (the MXE adds 1 to the encrypted balance)
- `revealMemberScore` → queues `reveal_member_score`; `pollMemberScoreRevealed` watches `is_revealed` for up to 90 s
- `resetMemberScore` → re-initialises the encrypted slot to 0 for the next gameweek

The reveal callback writes plaintext to `LeagueMember.gameweek_score` and `last_scored_gameweek` — visible on-chain to everyone from that moment forward. The UI labels the column accordingly (`GW{n} pts`) until the member earns their first win in the next GW, at which point `record_league_win` lazy-resets the slot.

**Live status**: full round-trip working on devnet. Multi-member leagues (>2 wallets) and mainnet cluster cutover are still untested.

---

### All integrations

| Integration | What's built | Status |
|---|---|---|
| **Arcium MPC** | Private markets (encrypted bet placement, MPC reveal) + private fan leagues (encrypted GW scores, reveal-on-demand with 90 s poll + retry CTA) | Devnet — full round-trip working for both surfaces; multi-member league test pending |
| **Jupiter Prediction Markets** | `JupiterMarketsClient` — events, markets, orderbook, leaderboard, positions; unified with native Terrace markets | Full |
| **Helius RPC** | All RPC calls via Helius endpoint; WebSocket subscription for live events in `useHeliusEvents`; Anchor event discriminator parsing for 6 event types | Full |
| **Privy** | Embedded wallet via `@privy-io/expo`; `setPrivySigner` wired in `App.tsx`; dual-track wallet (`mwa` for Seeker Seed Vault, `privy` for email/Google auth); idle-ping noise filtered via `utils/silencePrivyPing` | Full |
| **Solana Mobile / Mobile Wallet Adapter** | `@solana-mobile/mobile-wallet-adapter-protocol-web3js` for Seeker Seed Vault signing; shipping to the Solana Mobile dApp Store | Full |
| **Cloudflare Worker** | Push token registration, Helius webhook follow-graph fan-out, league-membership KV index, per-event league fan-out (`/league-event`, `/league-event-broadcast`), Telegram wallet linking, deep-link routing | Full |
| **Expo Push Notifications** | Token registered on launch; inbound `terraceKind: "league_event"` pushes captured into AsyncStorage and rendered in the bell-icon activity feed; notification tap → deep links to market / league | Full |
| **Telegram Bot** | `/flash` creates markets; `/leaderboard`, `/profile`, `/link` wallet linking; Gemini AI for market suggestion; in-memory sentiment votes | Full |
| **Google Gemini** | AI-assisted market suggestion and sentiment analysis in Telegram bot | Full |
| **Polymarket** | Sports markets piped into the unified market feed via `usePolymarketEvents` | Full |

---

## Running locally

### Prerequisites

- Node.js ≥ 18, pnpm ≥ 9
- Android SDK + `adb` on your PATH (for device builds)
- A Seeker / Android device with **USB debugging enabled**
- Expo CLI: `npm i -g expo-cli` (optional — `pnpm` scripts wrap it)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

Create `packages/app/.env` with the following keys:

```bash
EXPO_PUBLIC_HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=<your-key>
EXPO_PUBLIC_TERRACE_PROGRAM_ID=8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF
EXPO_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
EXPO_PUBLIC_PRIVY_CLIENT_ID=<your-privy-client-id>
EXPO_PUBLIC_JUPITER_API_KEY=<your-jupiter-api-key>
EXPO_PUBLIC_WORKER_BASE_URL=<your-cloudflare-worker-url>
EXPO_PUBLIC_GEMINI_API_KEY=<your-gemini-api-key>
```

### 3. Run on Seeker / Android device

Plug in your device via USB (USB debugging on), then:

```bash
# Confirm device is detected
adb devices

# Build and install on device (first run compiles native code ~2–3 min)
pnpm --filter @terrace/app android

# Or from inside packages/app:
cd packages/app && npx expo run:android
```

### 4. Start the Metro bundler only (after first install)

```bash
pnpm --filter @terrace/app start

# Or:
cd packages/app && npx expo start
```

Press `a` in the Metro terminal to open on a connected Android device.

### 5. Rebuild after native changes

If you add a new native dependency or change `app.json`:

```bash
cd packages/app
npx expo run:android --no-build-cache
```
