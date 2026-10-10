# Terrace on Monad — contracts + Chainlink CRE settlement

Free-to-play football prediction contests on Monad testnet (chain 10143).
Players predict exact scores for free; a Chainlink CRE workflow writes final
results onchain; anyone finalizes a contest to pay prizes and update each
player's onchain reputation.

Scoring: exact score = 3 pts, correct result (W/D/L) = 1 pt. Ties split the prize.

## Layout

```
contracts/
  src/TerraceLeagues.sol     contests, predictions, CRE receiver, reputation
  src/TerraceUSD.sol         testnet dollars with a faucet and onboarding minter (no value)
  test/TerraceLeagues.t.sol  Foundry tests (full flow, lock, forwarder guard)
  script/Deploy.s.sol        deploys both contracts
app/                         mobile PWA (Next.js + Privy smart wallets)
cre/settlement/
  main.ts                    CRE workflow: read pending -> fetch results -> write report
  config.staging.json        workflow config
```

## 1. Contracts

```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test -vv

export CRE_FORWARDER=<MockKeystoneForwarder for monad-testnet>
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $PK
```

Get the forwarder address from `cre workflow supported-chains` (after `cre login`).
A community report lists the monad-testnet MockKeystoneForwarder as
`0xB9F79d863261869B234c481D1f9A7af84AeAd192`; confirm it before deploying.
`setForwarder()` lets you switch to the production KeystoneForwarder later.

Seed fixtures (owner only). Use the results provider's match IDs as fixture IDs:

```bash
cast send $LEAGUES "addFixtures(uint256[],uint64[])" "[537785,537786]" "[1760198400,1760205600]" \
  --rpc-url monad_testnet --private-key $PK
```

## 2. CRE workflow

```bash
cre update                      # needs CLI >= 1.30 for Monad testnet simulation
cre init                        # TypeScript, blank template, name it "settlement"
# copy cre/settlement/main.ts and config.staging.json into the generated workflow folder
```

In the generated `project.yaml`, add a Monad testnet RPC to the target you simulate with:

```yaml
staging-settings:
  rpcs:
    - chain-name: monad-testnet
      url: https://testnet-rpc.monad.xyz
```

Declare the API key in `secrets.yaml` (follow the scaffold's format) as
`RESULTS_API_KEY`, and put the value in `.env`.

Set `leaguesAddress` in `config.staging.json`, then:

```bash
cre workflow simulate settlement --target staging-settings --broadcast
```

`--broadcast` makes the simulator submit a real transaction to Monad testnet
through the MockKeystoneForwarder, signed with your funded key (needs testnet MON).

### Results source

`main.ts` expects the football-data.org v4 match shape:
`{ status: "FINISHED", score: { fullTime: { home, away } } }`.
For a reliable demo, point `resultsApiBaseUrl` at a small replay server that
returns the same shape for historical matches.

## 3. Finalize

```bash
cast send $LEAGUES "finalizeContest(uint256)" 0 --rpc-url monad_testnet --private-key $PK
```

Or call it from the frontend when the last fixture settles.

## Honest notes for judges

- Monad testnet settlement runs through `cre workflow simulate --broadcast`
  (CRE CLI supports Monad testnet simulation from v1.30). The contract only
  accepts reports from the configured forwarder, and switches to the production
  KeystoneForwarder with `setForwarder()`.
- Free to play by default; prize pools are funded by contest creators/sponsors.
