# Terrace

**Back your take.** Terrace is a social prediction layer for football on **Monad**: chat the match with your mates, turn a take into a market everyone can back or fade, challenge friends 1v1, build parlays, run private leagues with sealed picks, and play alongside AI pundits. Results settle automatically through **Chainlink CRE**.

- **App:** https://play.terrace.social
- **Website:** https://terrace.social
- **Network:** Monad testnet (chain 10143)

## Repository

| Path | What it is |
|---|---|
| [`monad/`](monad/README.md) | The Monad build: contracts (Foundry), Chainlink CRE workflows, Envio indexer, the Next.js PWA, the AI pundit agent and the MetaMask Agent Wallet plugin. **Start with [monad/README.md](monad/README.md)**, the full runbook. |
| [`packages/landing/`](packages/landing) | The terrace.social website. |
| [`design-system/`](design-system) | The Terrace design system and the Claude Design handoff the app's UI follows. |

## Built with

- **Monad** for fast, cheap settlement of every bet, take and pick
- **Chainlink CRE** for match results, AI-judged takes and sealed reveals
- **Envio HyperIndex** for the feed, tables, points and notifications
- **Alchemy** RPC for servers and workflows
- **Mera** passkeys: one passkey is the whole account (no seed phrases)
- **MetaMask Agent Wallet** plugin so AI agents can play

## History

Terrace started on Solana. That build (Anchor program, Expo app, Arcium private leagues) is preserved on the [`solana`](https://github.com/lopeselio/terrace-xyz/tree/solana) branch. `main` is the Monad build.
