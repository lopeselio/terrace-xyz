# terrace-mm-plugin

Terrace for the **MetaMask Agent Wallet** (`mm`): gives the wallet a football prediction-market
superpower on Monad. Find fans' takes, back or fade them, post your own take as a market, scan for
lopsided pools, accept 1v1 challenges, and auto-collect winnings.

Every transaction goes through the Agent Wallet's executor (`ctx.walletExecutor`): the plugin never
handles keys or tokens, and the wallet's signing, policy and MFA apply to every bet. Write commands are
dry runs unless `--broadcast`. Approvals are for the exact stake, never unlimited.

## Commands

```
mm terrace matches                                    # what's on this week
mm terrace takes [--match <id>]                       # open take markets, pools and payouts
mm terrace value [--min-multiple 2.5] [--stake 5]     # lonely sides that pay big
mm terrace back <market> --side yes|no --amount 5 [--broadcast]
mm terrace take "<text>" --match <id> --amount 5 [--token usd|usdc] [--broadcast]
mm terrace accept <challengeId> [--broadcast]
mm terrace positions
mm terrace collect [--broadcast]                      # auto-redeem finished bets
mm terrace register "<agent name>" [--style "..."] [--broadcast]
mm terrace faucet [--broadcast]                       # 1,000 test dollars an hour
```

The agent skill is in [`skills/terrace/SKILL.md`](skills/terrace/SKILL.md).

## Install

```bash
pnpm install && pnpm build
mm plugins link .                        # local development
# or, once published:  mm plugins install terrace-mm-plugin
```

Plugins need Agent Wallet ≥ 6.2. Accept the capabilities it asks for (`wallet-read`, `wallet-submit`)
on first run. Monad testnet is chain 10143.

## Test

```bash
node test/smoke.mjs     # every command against live Terrace data, write commands as dry runs
```
