# Terrace — Idea Context

## One-liner
On-chain football prediction markets for fans — create markets in your group chat, chain parlays, follow sharps, and let your win rate become your on-chain reputation.

## Tagline
Back your team. Bet your take. Build your rep.

## The insight
Millions of football fans already have strong opinions. They argue in group chats, brag about correct calls, and obsess over player performance through FPL. Terrace gives those opinions economic weight and social permanence. Your win rate becomes your badge. Your parlays become your identity. Your correct calls live on-chain.

## Positioning
- To the fan: a social sports app — markets, matchups, parlays, flash contests, a feed of what your mates are backing
- To the builder: a prediction market engine on Solana with bonding curve AMMs, USDC settlement, permissionless market creation, and Kalshi/Polymarket liquidity underneath
- Crypto is the rail, not the product. The fan never thinks about wallets or gas.

## Target user
Football fans (Premier League first) aged 18–35 who already use FPL, argue in group chats, and want their correct calls to mean something beyond bragging rights. Not traders. Not DeFi natives. Fans.

## Core thesis
The future of sports fandom isn't passive. Social signaling — your calls, your win rate, your reputation — becomes part of fan identity. Just like influencers boast about views and founders boast about revenue, Terrace fans boast about their record.

## Salient features
- **Permissionless market creation** — any fan creates a market in seconds, drops it in a TG group or X thread via bot
- **Parlays** — chain multiple markets into a single conviction play, builds your badge
- **Matchups** — 1v1 head-to-head challenges, settle group chat debates with real stakes
- **Flash contests** — in-match micro-markets on next goal, next card, MOTM — rewards being fastest
- **Leverage** — amplify conviction on markets you're sure of, signals max belief
- **Frontend tooling** — Kalshi + Polymarket liquidity via DFlow, creators earn from their markets

## Reputation engine
Every action feeds an on-chain reputation PDA:
- Win rate (rolling league)
- Streak
- Badge tier: Casual → Sharp → Legend
- Prediction history — permanent, public, on-chain

## FPL layer (daily retention)
- Friends create private leagues
- Pick Premier League squads each gameweek
- Score on real player stats via Switchboard oracle
- Skill-based layer on top of prediction markets
- Gives fans a reason to open the app Tuesday, not just Saturday

## Group chat layer (distribution)
- Telegram bot: /market command drops a deep link into any group chat
- X/Twitter thread bot: share any market as a thread
- Private markets locked to friend groups via Light Protocol ZK compression
- Arcium MPC for confidential group market privacy
- Bonding curves reward early movers

## AI layer
- Personal prediction agent: watches win rate + live match data, surfaces relevant open markets
- Resolution oracle: reads match data + crowd consensus to settle subjective markets (MOTM, foul calls) — no centralized curator needed

## Comparable products
- Bento.fun (Base) — closest comp, user prediction markets, social-native, creator earnings. Terrace is Bento for football fans on Solana.
- Melee Markets (Solana) — "Pump.fun meets Polymarket", degen-native, less fan-focused
- Fantasy Premier League — 11M+ users, daily habit, squad obsession. Terrace layers stakes on top.
- Polymarket / Kalshi — institutional liquidity layer Terrace taps via DFlow, not the UX model

## Go-to-market
1. Premier League → Champions League → La Liga / Serie A
2. Solana Mobile dApp Store first (low competition, crypto-native users)
3. Expand to general Android + iOS + React web after PMF
4. Then: cricket, F1, NBA

## Why Solana
- Sub-second finality for in-match flash markets
- Low fees for micro-stakes fan bets
- Solana Mobile Stack for dApp Store distribution
- PNP Markets, Meteora, Light Protocol, Helius — all native
- USDC as settlement token throughout

## Landscape

```json
{
  "direct_competitors": [
    {
      "name": "Hedgehog Markets",
      "url": "https://www.hedgehog.markets",
      "status": "Live",
      "chain": "Solana",
      "strength": "AMM-style prediction markets, $20M+ TVL, 2,500+ markets, 3,500+ active users, pooled parlays in dev",
      "weakness": "Web-first (no mobile app), generic (sports + crypto + elections), no football fan culture/identity",
      "threat_level": "High"
    },
    {
      "name": "Monaco Protocol / BetDEX",
      "url": "https://monacoprotocol.xyz",
      "status": "Live",
      "chain": "Solana",
      "strength": "First P2P sports betting exchange on Solana, open-source infrastructure layer, fiat on/off ramp, ecosystem of built-on apps (Purebet, DisBet, Tinbet)",
      "weakness": "P2P liquidity matching complexity, not binary prediction market UX, no mobile app, limited sports coverage depth, low visible traction post-2023",
      "threat_level": "Medium"
    },
    {
      "name": "Drift BET",
      "url": "https://drift.trade",
      "status": "Live (recently launched)",
      "chain": "Solana",
      "strength": "Built on Drift Protocol's existing user base and liquidity, crypto + sports + economics categories, strong DeFi brand",
      "weakness": "DeFi power-user audience (not football fans), generic coverage, no mobile-first design",
      "threat_level": "Medium"
    },
    {
      "name": "Football.Fun",
      "url": "https://football.fun",
      "status": "Live",
      "chain": "Base + Solana (token only)",
      "strength": "Football-specific, $10.5M TVL peak, $700K/day revenue at peak, FUN token on Binance/Kraken, tokenized athlete exposure model, 11K+ wallets",
      "weakness": "Not prediction markets — tokenized athlete trading (different UX), volatile token economics, 40% referral fee unsustainable, Base-native (not Solana programs), regulatory risk",
      "threat_level": "Medium"
    },
    {
      "name": "Azuro Protocol",
      "url": "https://azuro.org",
      "status": "Live",
      "chain": "Polygon, Gnosis, Chiliz (NOT Solana)",
      "strength": "$358M total volume, ~$9.8M TVL, football = 69.4% of volume, modular infrastructure, multiple built-on apps",
      "weakness": "Not on Solana, not mobile-first, infrastructure layer (no consumer product), Ethereum L2 ecosystem",
      "threat_level": "Medium — could expand to Solana"
    },
    {
      "name": "Polymarket (via Jupiter integration)",
      "url": "https://polymarket.com",
      "status": "Live — Jupiter integration Feb 2026",
      "chain": "Polygon + Solana (via Jupiter)",
      "strength": "$12B+ Jan 2026 trading volume, CFTC-licensed, dominant brand, Jupiter DEX access brings Solana liquidity",
      "weakness": "Not football-specific, political/macro events dominate (low football depth), no mobile app, US regulatory lens distorts sports coverage",
      "threat_level": "High — but different user (info traders vs. football fans)"
    },
    {
      "name": "Hxro Network",
      "url": "https://hxro.com",
      "status": "Live",
      "chain": "Solana",
      "strength": "Parimutuel betting infrastructure on Solana, Pyth oracle integration, permissionless market creation",
      "weakness": "Parimutuel model (not binary), developer-facing, no consumer product layer",
      "threat_level": "Low"
    }
  ],
  "substitutes": [
    {
      "name": "Bet365 / DraftKings / William Hill",
      "approach": "Traditional regulated sportsbooks with massive football coverage, live betting, parlays",
      "why_users_stay": "Trust, regulation, UX polish, live streaming, fiat ease, massive market depth"
    },
    {
      "name": "Sorare",
      "approach": "Fantasy football NFT trading with licensed player cards — long-term engagement via team building",
      "why_users_stay": "Licensed player IP, gamified weekly competition, Ethereum/Starknet + global football coverage"
    },
    {
      "name": "Kalshi",
      "approach": "CFTC-regulated event contracts, 51% US prediction market volume",
      "why_users_stay": "Regulatory clarity, fiat rails, institutional trust, US sports coverage"
    },
    {
      "name": "Robinhood Prediction Markets",
      "approach": "Mainstream stock broker adding event contracts (2.3B trades Q3 2025)",
      "why_users_stay": "Existing user base, fiat ease, trusted brand, sports coverage"
    }
  ],
  "dead_projects": [
    {
      "name": "Augur (Ethereum)",
      "why_failed": "Gas costs made small bets uneconomical; UI complexity alienated non-traders; resolution disputes with no arbitration; 6-year development with no consumer traction"
    },
    {
      "name": "SportX v1 (Ethereum)",
      "why_failed": "Ethereum gas fees destroyed the unit economics of small sports bets; bootstrapping two-sided liquidity failed; rebranded to SX Bet but volume never recovered"
    },
    {
      "name": "FTX Prediction Markets / FTX Sports",
      "why_failed": "FTX collapse Nov 2022 wiped out platform and all on-chain liquidity on Solana at the time"
    },
    {
      "name": "Gnosis Conditional Tokens consumer apps",
      "why_failed": "Powerful infrastructure with no consumer layer; developer tooling without product UX; never achieved distribution"
    }
  ],
  "crowdedness": "sparse",
  "crowdedness_detail": "Solana prediction markets broadly: moderate (5+ live projects). Solana + football-specific + mobile-first: sparse. No project combines all three simultaneously.",
  "moat_type": "Community network effects + mobile distribution wedge",
  "moat_detail": {
    "primary": "Football fan community identity — tribal by club, competitive by match. Social graph of bettors creates network effects harder to fork than a smart contract.",
    "secondary": "Solana Mobile Stack / Seeker distribution — 150K+ Seeker phones shipped Aug 2025. A first-class dApp on the Seeker app store gets hardware-level distribution no web competitor can match.",
    "timeline": "Community moat becomes meaningful at ~10K monthly active bettors. Seeker moat is available from day one.",
    "biggest_threat": "Hedgehog Markets ships a mobile app + football-specific UI. ~3-6 month replication window."
  },
  "differentiation": "Fan-first football prediction markets on Solana mobile. Polymarket is for political nerds. Hedgehog is for DeFi traders. Terrace is for the fan who argues about Arsenal's xG at the pub and wants skin in the game. Mobile-native via Solana Mobile Stack (Seeker distribution wedge). Binary USDC markets = simple, familiar. Phase 2 parlays + reputation = social depth."
}
```

## Key Risks

1. **Hedgehog Markets mobile pivot** — they have the user base and Solana infrastructure; a dedicated football UX would compress Terrace's window to ~6 months.
2. **Azuro Solana expansion** — $358M volume on EVM with football-dominant flow could deploy a Solana program and out-liquidity any new entrant.
3. **Polymarket via Jupiter** — already accessible to Solana users; may expand sports/football depth as World Cup 2026 approaches.
4. **Regulatory** — binary outcome markets on sports events face varying regulatory treatment globally; geo-blocking and compliance tools needed early.
5. **Oracle settlement risk** — Pyth has no football match oracle out-of-the-box; creator-authority settlement is a centralization risk for Phase 1.

## World Cup 2026 Tailwind

FIFA World Cup 2026 (June–July 2026) is the single biggest prediction market event in football history. ADI Predictstreet is the official FIFA partner. DAZN embedding blockchain prediction markets in World Cup live streams. This is the launch window — shipping before June 2026 is table stakes.

## Phase Handoff

- Landscape mapped: April 2026
- Next phase: Validate oracle settlement path for football events (Pyth vs. UMA vs. creator authority)
- Artifact: `.superstack/competitive-landscape.html`
