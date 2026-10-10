# Terrace on Monad

**The social predictions layer for football fans.** Say your take in the match chat, put money
on it, and let the room back you or fade you. Leagues with your mates, a ranked feed of the
hottest takes, and a record you own. Fans sign in with a passkey and never see a seed phrase,
a gas fee or a signing pop-up.

Live: **https://terrace-monad.vercel.app** · Monad testnet (chain 10143)

---

## How it fits together

```
 Fan's phone (PWA)                                    Chainlink CRE (Monad testnet)
 ├─ Mera passkey: one ceremony → account,             ├─ settlement: schedules fixtures, writes final scores
 │  agent wallet, sealing key, memory key              ├─ questions: settles takes by rule from live match
 ├─ Match rooms: chat → "Make it a market"             │  data, or by the AI judge for rule-less takes
 │  (AI take compiler → rule → plain-English reading)  └─ reveal: opens sealed bets and picks in a TEE
 ├─ Leagues: table, sealed picks, member votes                    │ signed reports
 └─ Ranked feed of takes                                          ▼
          │ transactions (Alchemy / public RPC)        TerraceOracle ──► Markets · Parlays · Matchups
          ▼                                                          Leagues · Governance · Chat
 Monad testnet contracts ──── events ───► Envio HyperIndex (HyperSync) ──► GraphQL ──► app
```

- **Contracts** (`contracts/`, Foundry): `TerraceOracle` (the only source of results; CRE receiver),
  `TerraceMarkets` (yes/no pools, public or sealed; chat takes become markets), `TerraceParlays`
  (weekly accumulator pot), `TerraceMatchups` (1v1), `TerraceLeagues` (exact-score contests,
  seasons, sealed picks), `TerraceGovernance` (members vote on gameweeks and featured takes),
  `TerraceChat` (match and league rooms), `TerraceReputation` (records, badges, points, agents),
  `TerraceUSD` (test dollars). Stakes settle in test dollars or Circle's testnet USDC.
- **Chainlink CRE** (`cre/`): three workflows plus shared code (rule language, sealing, signing).
- **Envio indexer** (`indexer/`): chat, takes, markets, leagues and records, with a heat score per
  take for the ranked feed. See `indexer/README.md`.
- **App** (`app/`): Next.js PWA on Vercel. Mera is the whole account layer.

### What's in the app

Same "Terrace Night" design system as the Solana app (dark canvas, green to back, red to fade,
violet for sealed, Barlow; see `../design-system/` and `../packages/app/src/theme/tokens.ts`).

| Screen | What fans do |
|---|---|
| Home `/` | "Back your take." Live and upcoming matches, the ranked feed of hottest takes |
| Matches `/matches`, `/m/[id]` | Match room: chat, back takes for free, **Make it a market** (AI reads the take into a rule), back or fade listed takes, collect; match-result picks for accas and 1v1s |
| Take `+` `/take` | Pick a match and say your take |
| 1v1 `/challenges`, `/c/[id]` | Challenge a mate on any result or take, share a WhatsApp link, take the other side, settle |
| Accumulators `/acca` | Build a 2 to 8 leg slip across matches; weekly pot split by stake × legs |
| Leagues `/leagues`, `/l/[id]` | Create (fee, gameweeks, creator-run or member-voted, private with sealed picks), join by invite link, table, gameweek picks, votes, league chat, crown the champion |
| Profile `/me` | Record (points, badge, win rate, streak, exact scores, takes that came in), balances, and every key the passkey derives |

Sign-in is one passkey ceremony (Mera); new fans are topped up with gas, test dollars and testnet USDC.

### How takes settle

1. When a fan lists a take, the **take compiler** (Gemini or Claude) turns the text into a rule in
   Terrace's rule language: events in a minute window, starting XI, team stats, player stats or score.
2. The fan confirms a **plain-English reading generated from the rule by code**, never by the AI,
   so what they agree to is exactly what gets checked.
3. The **CRE questions workflow** evaluates the rule against API-Football's live data every minute;
   every node computes the same answer. "At least" takes settle the moment they happen.
4. Takes with no possible rule ("Pep wears the grey jumper") go to the **AI judge** after full time,
   with the match events as evidence; nodes must agree. Anything unclear is **void and refunded**.

---

## Deployed (Monad testnet, v2)

Addresses live in [`deployments/10143.json`](deployments/10143.json), which the app, indexer and
workflows all read.

| Contract | Address |
|---|---|
| TerraceOracle | `0xca494cB3460b446357a86d656A93aD8b0f2137A3` |
| TerraceMarkets | `0xCa6a892e302582eE34a2cfe3a57c7e97A2868773` |
| TerraceParlays | `0x92Ebb11226E270465EBa9401e839bf4aC627a9C2` |
| TerraceMatchups | `0xd411fFE50574962e9376c60d72939F6982350E4B` |
| TerraceLeagues | `0x4Df3ADf78A7Cb3B4F38ef0f0e8d450b69CdBB5a6` |
| TerraceGovernance | `0xe59B32B430633203205af9AeA909d8d3F1875c20` |
| TerraceChat | `0x7C790222f618C068f2Cd549f72CB08E7Ba91108e` |
| TerraceReputation | `0x7d53b1C9EaD4274dA03318c6599c7831d727F0B3` |
| TerraceUSD (test dollars) | `0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe` |

Indexer GraphQL: `https://indexer.dev.hyperindex.xyz/ba3334d/v1/graphql`

---

## Runbook

### Match day (settling live matches)

Until CRE deploy access, workflows settle through `cre workflow simulate --broadcast` on a machine
with the CRE CLI. The match-day runner triggers them on a schedule:

```bash
cd cre
bun run matchday
```

- Start it **before the first kickoff** and leave it running until the last match has settled.
  It keeps the Mac awake (`caffeinate`); keep the lid open and power connected.
- It only runs a workflow when the oracle says there's work:
  questions every minute · live results every 2 minutes · reveals every 5 minutes · new fixtures every 6 hours.
- Each line shows what happened, e.g. `questions  question 1 "Haaland scores in the first half": YES (rule) | answered 1`.
- Stop with **Ctrl+C** after full time once the results line shows the match settled.

Run a single workflow by hand:

```bash
cd cre
cre workflow simulate settlement -T staging-settings --non-interactive --trigger-index 1 --broadcast   # schedule fixtures
cre workflow simulate settlement -T staging-settings --non-interactive --trigger-index 0 --broadcast   # write results
cre workflow simulate questions  -T staging-settings --non-interactive --trigger-index 0 --broadcast   # settle takes
cre workflow simulate reveal     -T staging-settings --non-interactive --trigger-index 0 --broadcast   # open sealed picks
```

### AI agents

**The Gaffer** (`agents/pundit.ts`) is an autonomous AI player: each round it asks Gemini (with live
search) for one checkable take per upcoming match, lists it only if Chainlink can settle it from match
data, backs it, and fades the crowd on lopsided pools. It registers as an AI player, so the app labels it.

```bash
cd agents
bun install
bun run key        # creates AGENT_PRIVATE_KEY in agents/.env, prints the address
bun run pundit     # runs every 10 minutes; tops itself up with gas like any fan
```

**MetaMask Agent Wallet plugin** (`mm-plugin/`): gives `mm` Terrace commands (find takes, back or fade,
post a take as a market, value scan, accept 1v1s, auto-collect, register as an AI player). Every
transaction goes through the Agent Wallet's executor and policy; writes are dry runs unless `--broadcast`.
See [`mm-plugin/README.md`](mm-plugin/README.md) and [`mm-plugin/skills/terrace/SKILL.md`](mm-plugin/skills/terrace/SKILL.md).

```bash
cd mm-plugin && pnpm install && pnpm build && mm plugins link .
mm terrace takes
mm terrace value --min-multiple 2.5
```

### Tests

```bash
cd contracts && forge test                 # contracts
cd cre && bun test shared                  # rule language, sealing, attestation
cd cre && bun run e2e:sealed               # live: sealed bet → CRE reveal (TEE) → verified on-chain
cd indexer && pnpm test                    # indexer handlers
cd mm-plugin && node test/smoke.mjs        # plugin commands against live data (dry runs)
```

### Deploy the app

```bash
cd app
./scripts/deploy.sh
```

Builds locally (the app imports `../cre/shared` and `../deployments`) and ships a prebuilt
deployment to Vercel. The Vercel team stores every variable as sensitive, so the script fills the
public `NEXT_PUBLIC_*` values from `app/.env.local` before building; server secrets stay on Vercel.
Upload hiccups are retried automatically.

### Update the hosted indexer

Envio's hosted service deploys from the **`envio`** branch (root `monad/indexer`). After changing
the indexer:

```bash
git push origin main:envio
```

then point `INDEXER_URL` at the new deployment if its endpoint changed, and redeploy the app.

### Run everything locally

```bash
# indexer (needs Docker Desktop running and indexer/.env with ENVIO_API_TOKEN)
cd indexer && pnpm install && pnpm dev          # GraphQL at http://localhost:8080/v1/graphql

# app (app/.env.local, see app/.env.example)
cd app && pnpm install && pnpm dev               # http://localhost:3000
```

Passkeys need HTTPS on phones, so test on the Vercel deployment (or a tunnel) rather than a LAN IP.
A passkey belongs to one domain: an account made on `terrace-monad.vercel.app` stays there.

### Keys and secrets

Nothing secret is committed; `.env` files are gitignored and a pre-commit hook blocks key-shaped strings.

| Where | What |
|---|---|
| `cre/.env` | `CRE_ETH_PRIVATE_KEY` (broadcaster), `CRE_SECRET_SIM_ATTESTOR_PRIVATE_KEY`, `CRE_SECRET_REVEAL_PRIVATE_KEY`, `CRE_SECRET_RESULTS_API_KEY` (API-Football), `CRE_SECRET_GEMINI_API_KEY`, `ALCHEMY_API_KEY` |
| `app/.env.local` | `ONBOARDING_PRIVATE_KEY` (treasury), `API_FOOTBALL_KEY`, `GEMINI_API_KEY`, `ALCHEMY_API_KEY`, `NEXT_PUBLIC_REVEAL_PUBLIC_KEY`, `INDEXER_URL` |
| `indexer/.env` | `ENVIO_API_TOKEN` |
| `agents/.env` | `AGENT_PRIVATE_KEY`, `GEMINI_API_KEY`, `ALCHEMY_API_KEY` |

`cd cre && bun run keys` creates missing workflow keys in `cre/.env` and prints only public halves.
Wallets to keep funded with testnet MON: CRE broadcaster `0x901E8F75cc9F453fD9530b0C5b6763A1343949d7`
(simulated reports) and onboarding treasury `0x7C45b7d13aCBCc0F62fb061EE05Bb2E1a4991718`
(0.5 MON of gas per fan and agent, topped up below 0.15; also send it testnet USDC from faucet.circle.com).
House agent: `0x637f37B1ED24aA918a7db54847f5906EEDd32d37` (tops itself up from the treasury).

### Contracts

```bash
cd contracts
forge test                                    # 60+ tests
export ALCHEMY_API_KEY=$(grep '^ALCHEMY_API_KEY=' ../cre/.env | cut -d= -f2)
CRE_PRODUCTION_FORWARDER=0xF8344CFd5c43616a4366C34E3EEE75af79a74482 \
CRE_SIMULATION_FORWARDER=0xB9F79d863261869B234c481D1f9A7af84AeAd192 \
CRE_SIM_ATTESTOR=0x34c40bEd79F6d537d9e8C6012D7216766b91c633 \
ONBOARDING_MINTER=0x7C45b7d13aCBCc0F62fb061EE05Bb2E1a4991718 \
TESTNET_USDC=0x534b2f3A21130d7a60830c2Df862319e593943A3 \
forge script script/Deploy.s.sol --rpc-url monad_alchemy --account terrace-deployer --broadcast --slow
```

Run deploys in a normal Terminal tab (the keystore asks for a password). After a redeploy, update
`deployments/10143.json`, the CRE configs, `indexer/config.yaml` and push `main:envio`.

---

## Disclosures

- Terrace started on Solana before this hackathon (preserved on the `solana` branch). Everything in
  this folder (the Monad contracts, CRE workflows, indexer and the Mera-based app) was built during
  the hackathon window.
- Monad testnet settlement runs through CRE simulation with `--broadcast` via the
  MockKeystoneForwarder. Because the mock forwarder checks no signatures, every simulated report is
  also signed by an attestor key that `TerraceOracle` verifies; `lockProduction()` switches to the
  production KeystoneForwarder only.
- Testnet only: test dollars and testnet USDC have no value.
