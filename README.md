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

## Development

```bash
pnpm install
pnpm dev          # starts Expo dev server
```

Requires `EXPO_PUBLIC_HELIUS_RPC_URL` and `EXPO_PUBLIC_TERRACE_PROGRAM_ID` in `packages/app/.env`.
