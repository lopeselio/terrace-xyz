# Terrace

On-chain football prediction markets on Solana (devnet).

## Stack

- **Program** — Anchor 0.30, Solana devnet
- **Client** — React Native + Expo (Seeker / Android)
- **Wallet** — Privy embedded wallet + Mobile Wallet Adapter
- **RPC** — Helius
- **Settlement token** — devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)

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

## Important notes

- **Creator ≠ Bettor for reputation purposes.** Settling a market you created does not affect your Reputation PDA. Only placing bets and then claiming/losing does.
- **`settle_market` has no on-chain expiry check.** Creators can settle any Open market at any time — the UI shows settle buttons for all Open markets regardless of expiry.
- **`claim_winnings` requires the market creator address.** The UI fetches this from the Market account via `getAccountInfo` before building the transaction.
- **Reputation PDA is created lazily** on the first `claim_winnings` or `record_loss` call for a wallet.

---

## Program accounts

| Account | Seeds | Key fields |
|---------|-------|-----------|
| Market PDA | `[b"market", creator, nonce_le]` | question, expiry, creator, outcome, total_volume, status, is_flash, is_private |
| Bet PDA | `[b"bet", market, bettor]` | outcome, amount, claimed, result_recorded |
| Reputation PDA | `[b"reputation", owner]` | total_bets, winning_bets, win_rate_bps, current_streak, badge_tier |
| Parlay PDA | `[b"parlay", owner, nonce_le]` | legs[], stake_usdc, status |

---

## Integrations

### Arcium MPC (private markets)

Client-side implementation is complete. Encrypted bet placement uses X25519 ECDH against the MXE's pubkey — ephemeral keypair generated per bet, outcome + amount XOR-encrypted field-by-field. A `blake3(outcome_byte || secret_32_bytes)` commitment is stored on-chain; the secret is persisted to `expo-secure-store` keyed by the `privateBetRecord` PDA so `claimWinnings` needs no outcome param.

Three on-chain MPC computation definitions are registered (`init_private_market_state`, `place_private_bet`, `reveal_private_market`) via `packages/programs/scripts/init-arcium-comp-defs.ts`. The `usePrivateMarket` hook covers the full flow: `placeBet` → `revealMarket` (queues MPC circuit) → `claimWinnings`.

**Gap**: `revealMarket` submits the instruction and queues the computation — the MPC callback that auto-settles the market runs on Arcium's network. Full round-trip requires Arcium's MXE node to be live and watching the program ID on devnet.

UI surface: `ArciumBadge`, `ArciumPrivacyBanner`, `ArciumSettledBanner` components; `PrivateBetPanel` in `MarketDetailSheet`; "Reveal market (Arcium MPC)" button in Profile → Created tab.

---

### All integrations

| Integration | What's built | Status |
|---|---|---|
| **Arcium MPC** | Private markets — encrypted bet placement, MPC reveal, claim via SecureStore secret | Client complete; MXE callback depends on Arcium devnet being live |
| **Jupiter Prediction Markets** | `JupiterMarketsClient` — events, markets, orderbook, leaderboard, positions; unified with native Terrace markets | Full |
| **Helius RPC** | All RPC calls via Helius endpoint; WebSocket subscription for live events in `useHeliusEvents`; Anchor event discriminator parsing for 6 event types | Full |
| **Privy** | Embedded wallet via `@privy-io/expo`; `setPrivySigner` wired in `App.tsx`; dual-track wallet (`mwa` for Seeker Seed Vault, `privy` for email/Google auth) | Full |
| **Mobile Wallet Adapter** | `@solana-mobile/mobile-wallet-adapter-protocol-web3js`; `transact()` for Seeker Seed Vault signing | Full |
| **Telegram Bot** | `/flash` creates markets; `/leaderboard`, `/profile`, `/link` wallet linking; Gemini AI for market suggestion; in-memory sentiment votes | Full |
| **Cloudflare Worker** | Push token registration, Helius webhook fan-out, Telegram wallet linking via KV, deep link routing | Full |
| **Expo Push Notifications** | Token registered on launch, notification tap → deep links to market | Full |
| **Gemini AI** | AI-assisted market suggestion and sentiment analysis in Telegram bot | Full |

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
