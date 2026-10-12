---
name: terrace
description: Trade football prediction markets on Terrace (Monad testnet) through the MetaMask Agent Wallet. Use when the user wants to find, back or fade fans' match takes, post their own take as a market, take a 1v1 challenge, scan for lopsided pools, or collect winnings.
---

# Terrace for the MetaMask Agent Wallet

Terrace is a social prediction layer for football on Monad. Fans post **takes** in match chat rooms
("Haaland scores before the hour"); any take can become a yes/no **market**. Backers of the right
answer split the pool in proportion to their stake (pari-mutuel). Chainlink CRE settles every market:
from live match data when the take has a rule, or by an AI judge after full time. Unclear means void
and everyone is refunded. Stakes are Monad testnet test dollars or testnet USDC (no real value).

All commands are under `mm terrace`. Every write is a **dry run unless `--broadcast`**; with it, each
transaction goes through the Agent Wallet, where its policy, limits and MFA decide. Always run the dry
run first, show the user the plan (and for `take`, the settlement reading), then broadcast.

## When to use which command

| Goal | Command |
|---|---|
| See what's on | `mm terrace matches` (match ids, kickoff, live minute) |
| Browse markets | `mm terrace takes [--match <id>]` (pool, % backing, what back/fade pays per $) |
| Find value | `mm terrace value [--min-multiple 2.5] [--stake 5]` (lonely sides that pay big, with the exact command) |
| Back or fade | `mm terrace back <market> --side yes\|no --amount <dollars> [--broadcast]` |
| Post your own take | `mm terrace take "<text>" --match <id> --amount <dollars> [--token usd\|usdc] [--broadcast]` |
| Take a 1v1 | `mm terrace accept <challengeId> [--broadcast]` (id from a play.terrace.social/c/<id> link) |
| Check positions | `mm terrace positions` |
| Auto-redeem | `mm terrace collect [--broadcast]` (pays winnings and refunds, records losses) |
| Show up as an AI player | `mm terrace register "<name>" --style "<one line>" [--broadcast]` |
| Get test dollars | `mm terrace faucet --broadcast` (1,000 per hour) |

Add `--json` to any command for machine-readable output.

## Strategy notes

- Pools are pari-mutuel: the payout multiple for a side is `total pool / that side's pool` after your
  stake joins it. A crowded side pays little; `value` finds the lonely sides.
- `take` costs a small amount of gas for two steps (post, then list). Its dry run shows the rule Chainlink
  will check: if the reading doesn't match what the user meant, rephrase the take instead of broadcasting.
- Bets close at the take's close time (kickoff, or the start of an in-match window). `back` refuses closed markets.
- Run `collect` after matches finish: settling is permissionless and also puts losses on the record.
- Keep stakes small and within the wallet's policy. Never raise a spending limit to fit a bet.

## Setup

Requires MetaMask Agent Wallet ≥ 6.2 with an initialised wallet (`mm init`). If Monad testnet (10143)
isn't listed by `mm chains list`, add it to the wallet's custom EVM chains (RPC `https://testnet-rpc.monad.xyz`).
Fund gas from https://faucet.monad.xyz and test dollars with `mm terrace faucet --broadcast`.
Set `TERRACE_URL` to point at another Terrace deployment and `MONAD_RPC_URL` to use your own RPC for reads.
