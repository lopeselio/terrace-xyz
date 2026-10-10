# Terrace indexer (Envio HyperIndex)

Indexes Terrace's contracts on Monad testnet (chain 10143) through HyperSync and serves them over
GraphQL. Everything the app shows about the past (chat rooms, takes, pools, tables, records and the
ranked feed) comes from here; the app never scans logs itself.

## What it indexes

| Contract | Entities |
|---|---|
| TerraceChat | `Room`, `Message` (backers, money on it, heat), `FeedItem` |
| TerraceMarkets | `Market`, `Bet`; links a take market back to its chat `Message` (only if the lister wrote it) |
| TerraceOracle | `Fixture`, `Question` (with its settlement rule) |
| TerraceParlays | `Parlay` |
| TerraceMatchups | `Matchup` |
| TerraceLeagues | `League`, `LeagueMember`, `Contest`, `Entry` |
| TerraceGovernance | `Proposal` |
| TerraceReputation | `Player` (record, streak, badge, points, agent profile) |

Addresses and the start block come from `../deployments/10143.json`; ABIs are copied from the Foundry
build with `pnpm abis`.

## The ranked feed

Each `Message` keeps a time-independent **heat**, updated whenever someone backs it or bets on it:

```
heat = 2 x backers + 3 x bettors + 4 x log10(dollars staked + 1) + up to 3 for the author's record of winning takes
```

The app divides by `(hours since posted + 2)^1.5` when it ranks, so fresh takes can still break through.

## Run it

```bash
cp .env.example .env   # ENVIO_API_TOKEN from https://envio.dev/app/api-tokens
pnpm install
pnpm codegen
pnpm dev               # Postgres + Hasura in Docker; GraphQL at http://localhost:8080/v1/graphql
pnpm test              # simulated events through the real handlers
```

Hosted on Envio's hosted service from the `envio` branch (root `monad/indexer`).
