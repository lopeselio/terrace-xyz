# Terrace on Monad — context for Claude Code

This folder (`monad/`) is the Monad port of Terrace for Monad's **Metropolis hackathon**.
The Solana app (`packages/`) is prior work, preserved on the `solana` branch. `main` is now the
Monad build; leave `packages/` untouched unless asked to prune it.

## Deadline and branch
- Submission closes **Wed 14 Oct 2026, 03:59 UTC (9:29 AM IST)**. Target: submit Tue 13 Oct evening.
- Branch: `main` (Monad build). The Solana build lives on the `solana` branch. Commit small and often with clear messages. The rules expect
  commit history covering the build window, so never squash.

## What we're building
A **user-first social football predictions app** on Monad testnet (chain id 10143), shipped as a
**mobile PWA**. FPL-style: pick exact scores for free, challenge mates by link, climb the table,
keep an onchain record (points, accuracy, streaks, wins).
- Track: **Social, Attention & Culture** (not Consumer: that track excludes trading products).
- **Free to play by default.** Prize pools are funded by contest creators or sponsors. No paid
  entries or stakes in the main flow (India's 2025 online gaming law bans real-money games,
  skill-based or not).
- Settlement: **Chainlink CRE** workflow fetches results, reaches consensus, writes a signed
  report to the contract.

## Product rules (non-negotiable)
- Football language only: picks, points, challenges, table, record. Never show "wallet", "gas",
  "transaction", "onchain", "token", addresses or hashes in the main flow (advanced settings only).
- Play before sign-in: visitors make picks first; sign in (email/SMS via Privy) only to save.
- No signing pop-ups, no pending spinners: sponsored smart wallet, optimistic "Locked in".
- Errors in plain language (see `friendlyError` in `app/src/lib/terrace.ts`).
- Design: claret #7A1F3D / sky #8EC5EA / floodlight #F4C542 / chalk #F7F8F5 / ink #1C2433;
  Big Shoulders for numerals and headings, Figtree for body. The striped scarf band appears
  only on the challenge card. Keep everything else quiet.

## Layout
- `contracts/` Foundry. `TerraceLeagues.sol` (contests, predictions, CRE receiver, reputation),
  `TestUSD.sol` (faucet prize token), tests, deploy script.
- `cre/settlement/` CRE TypeScript workflow (`main.ts`, `config.staging.json`).
- `app/` Next.js 15 PWA with Privy smart wallets and viem. All wallet code lives in
  `app/src/lib/useTerraceWallet.ts`; team names for fixture ids in `app/src/lib/fixtures.ts`.

## Monad testnet facts
- RPC `https://testnet-rpc.monad.xyz`, chain id 10143, CRE chain name `monad-testnet`,
  chain selector `2183018362218727504`.
- CRE CLI must be >= 1.30 (Monad testnet simulation). Settlement runs via
  `cre workflow simulate settlement --target staging-settings --broadcast`.
- MockKeystoneForwarder (simulation): community-reported `0xB9F79d863261869B234c481D1f9A7af84AeAd192`.
  **Verify** with `cre workflow supported-chains` (after `cre login`) and by calling
  `typeAndVersion()` on it before deploying. `setForwarder()` switches it later.

## Still to verify (do not assume)
1. The mock forwarder address above.
2. Privy smart wallets + sponsored paymaster on chain 10143. If not offered by default, configure a
   Pimlico or Alchemy bundler/paymaster URL for 10143 in the Privy dashboard.
3. That fixture ids in `fixtures.ts` match the ids seeded with `addFixtures` and the results API.

## Secrets
- Never print, commit or echo private keys or API keys. Use `.env` / `.env.local` (gitignored).
- Ask the human before any command that spends testnet funds or deploys contracts.

## Plan
- **Fri 9:** forge tests → deploy contracts → seed fixtures → one CRE broadcast settles a result.
  Privy app setup → deploy PWA to Vercel → install on iPhone.
- **Sat 10:** full loop on two phones (create → share → picks → settle → table → finalize).
  Evening: 5 non-crypto FPL friends test it; log every hesitation.
- **Sun 11:** fix tester friction; replay results server for a fast demo; push notifications if time.
- **Mon 12:** (Colosseum due) bug fixes only; record 3-min demo on iPhone.
- **Tue 13:** 2-min pitch, README disclosures, share repo with metropolis@hackathon.monad.xyz, submit.

## Disclosure (for README and pitch)
- Built on the Terrace codebase started on Solana before the hackathon; contracts, CRE workflow and
  PWA in this folder were built during the hackathon window.
- Monad testnet settlement uses CRE simulation with `--broadcast` through the mock forwarder;
  CRE supports production writes on Monad mainnet.
