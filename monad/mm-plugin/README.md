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

Plugins need Agent Wallet ≥ 6.2 and the plugin beta (`mm config set experimentalPlugins true`).
Accept the capabilities it asks for (`wallet-read`, `wallet-submit`) on install. Monad testnet is chain 10143.
Install it with `mm plugins install`: `mm plugins link` only grants read commands, so a linked copy can't send.

## Sending on Monad testnet

MetaMask's RPC proxy answers `Invalid chainId` for Monad testnet, so the wallet can't build a
transaction there yet. Until it does, run the bundled relay in another tab and point `mm` at it for
write commands. It sends chain 10143 to Monad's RPC and passes every other chain to MetaMask unchanged.

```bash
npx -p terrace-mm-plugin terrace-relay                    # leave running
MM_INFURA_RPC_BASE_URL=http://127.0.0.1:8547 mm terrace back 342 --side yes --amount 5 --broadcast
```

On its first send, Terrace tops the wallet up with gas and $100 in test dollars, and the wallet registers
as an AI player ("MetaMask agent"; run `mm terrace register "<name>" --broadcast` first to pick its name). In Guard mode, MetaMask
asks you to approve by email or in MetaMask Mobile any call outside your policy.

## Test

```bash
node test/smoke.mjs     # every command against live Terrace data, write commands as dry runs
```
