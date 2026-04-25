# Terrace — Build Context

## Repo structure

```
terrace/
  packages/programs/   Anchor 0.30 Solana programs
  packages/app/        React Native + Solana Mobile Stack
  packages/sdk/        Shared TypeScript SDK (@solana/kit)
  CLAUDE.md            Persistent Claude Code context
  .superstack/         Phase handoff context (this file)
```

## Tech stack

### On-chain (packages/programs/)
- **Framework:** Anchor 0.30
- **Language:** Rust
- **Client SDK:** @solana/kit (never @solana/web3.js v1)
- **Token:** USDC (SPL Token, devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)
- **Testing:** LiteSVM (unit), Surfpool (integration with mainnet fork)

### Mobile (packages/app/)
- **Framework:** React Native 0.74
- **Wallet:** Solana Mobile Stack — Seed Vault + Phantom Connect SDK
- **RPC:** Helius (devnet → mainnet)
- **Real-time:** Helius WebSocket feeds
- **Distribution:** Solana Mobile dApp Store first

### Key integrations

| Integration | Purpose |
|---|---|
| PNP Markets | Permissionless market creation primitive |
| Meteora AMM | Bonding curve for YES/NO price discovery |
| Pyth / Switchboard | Match result oracle feeds, player stat feeds |
| Helius | RPC, DAS API, WebSocket, enhanced transactions |
| Phantom Connect | Wallet connection, social login |
| Light Protocol | ZK compression for private group market PDAs |
| DFlow | Kalshi + Polymarket liquidity bridge, builder fees |
| Solana Agent Kit | AI prediction agent + resolution oracle |
| Arcium MPC | Confidential group market privacy (post-MVP) |
| USDC | Settlement token throughout |

## Program accounts

### Market PDA
Seeds: `[b"market", creator.key(), &nonce.to_le_bytes()]`

```rust
pub struct Market {
    pub creator: Pubkey,
    pub question: String,       // max 200 chars
    pub expiry: i64,            // unix timestamp
    pub outcome: Option<bool>,  // None = open, Some(true/false) = settled
    pub total_volume: u64,      // USDC lamports (6 decimals)
    pub creator_fee_bps: u16,   // e.g. 200 = 2%
    pub is_private: bool,
    pub nonce: u64,
    pub bump: u8,
}
```

### Reputation PDA (per wallet)
Seeds: `[b"reputation", owner.key()]`

```rust
pub struct Reputation {
    pub owner: Pubkey,
    pub total_bets: u32,
    pub winning_bets: u32,
    pub win_rate_bps: u16,      // basis points, e.g. 6500 = 65%
    pub current_streak: i16,    // positive = win streak, negative = loss streak
    pub badge_tier: BadgeTier,  // Casual, Sharp, Legend
    pub bump: u8,
}
```

### Parlay PDA
Seeds: `[b"parlay", creator.key(), &nonce.to_le_bytes()]`

```rust
pub struct Parlay {
    pub creator: Pubkey,
    pub market_ids: Vec<Pubkey>, // max 8 legs
    pub stake_usdc: u64,
    pub status: ParlayStatus,    // Open, Won, Lost, Cancelled
    pub bump: u8,
}
```

### Matchup PDA (1v1)
Seeds: `[b"matchup", challenger.key(), market.key()]`

```rust
pub struct Matchup {
    pub challenger: Pubkey,
    pub opponent: Pubkey,
    pub market: Pubkey,
    pub stake_usdc: u64,
    pub status: MatchupStatus,  // Pending, Accepted, Settled, Declined
    pub bump: u8,
}
```

### Bet PDA (current scaffold)
Seeds: `[b"bet", market.key(), bettor.key()]`

```rust
pub struct Bet {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,    // 0 = No, 1 = Yes
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
```

## Build phases

### Phase 1 — Scaffold ✓ (complete)
- [x] Monorepo: Turborepo + pnpm workspaces
- [x] Anchor workspace + program skeleton (Market PDA, Bet PDA, USDC vault)
- [x] Instructions: `create_market`, `place_bet`, `settle_market`
- [x] SDK: typed @solana/kit client for all 3 instructions
- [x] App skeleton: wallet connect + market list screen (React Native + Solana Mobile Stack)

### Phase 2 — Core on-chain program
- [ ] Permissionless market creation (PNP Markets pattern)
- [ ] Bonding curve AMM for YES/NO tokens (Meteora)
- [ ] `claim_winnings` instruction — pro-rata USDC payout from vault
- [ ] Parlay instruction — chain N markets, USDC escrow, auto-settle
- [ ] Reputation PDA — update on every settled bet
- [ ] Pyth oracle settlement + automated USDC payout
- [ ] Security: signer checks, overflow guards, CPI reentrancy protection

### Phase 3 — Social layer
- [ ] Social feed UI — live market cards, friend activity, sharp feed
- [ ] Badge tier display — Casual / Sharp / Legend with win rate
- [ ] Private group markets — Light Protocol ZK compression
- [ ] Telegram bot — grammY, `/market` command, deep link
- [ ] 1v1 Matchup challenge program + UI
- [ ] Flash contest markets — in-match micro-markets (next goal, MOTM, next card)

### Phase 4 — Integrations + mainnet
- [ ] DFlow + Kalshi/Polymarket liquidity bridge
- [ ] FPL fantasy squad layer + Switchboard player stat oracles
- [ ] AI prediction agent — Solana Agent Kit (surface relevant open markets)
- [ ] AI resolution oracle — crowd consensus + match data for subjective markets
- [ ] Surfpool mainnet fork integration testing
- [ ] Solana Mobile dApp Store submission

## Skills loaded
- `pnp-markets-skill` — permissionless market primitives
- `solana-anchor-claude-skill` — Anchor 0.30 programs
- `meteora` — bonding curve AMM
- `pyth` — oracle settlement
- `switchboard` — player stat feeds
- `phantom-connect` — wallet + social login
- `helius` — RPC, WebSocket, DAS
- `helius-phantom` — combined frontend
- `helius-dflow` — liquidity bridge
- `light-protocol` — ZK compressed private markets
- `solana-agent-kit` — AI agents
- `surfpool` — mainnet fork testing
- `vulnhunter` — security review
- `pnp-markets-solana` — market creation patterns

## Hard rules for Claude Code
- **Never** use `@solana/web3.js v1` — `@solana/kit` only in SDK and app
- **Never** hardcode private keys or RPC URLs — use `.env`
- **Always** validate signers on every instruction
- **Always** validate bump on every PDA instruction
- USDC amounts always in `u64` lamports (6 decimals, 1 USDC = 1_000_000)
- Run `vulnhunter` security checklist before any devnet deploy
- Overflow: use `checked_add` / `checked_mul` throughout — never raw arithmetic on token amounts
