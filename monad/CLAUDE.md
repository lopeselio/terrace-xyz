# Terrace on Monad — context for Claude Code

This folder (`monad/`) is the Monad port of Terrace for Monad's **Metropolis hackathon**.
`main` is the Monad build; leave `packages/` untouched unless asked to prune it.

## Deadline and branch
- Submission closes **Wed 14 Oct 2026, 03:59 UTC (9:29 AM IST)**. Target: submit Tue 13 Oct evening.
- Branch: `main` (Monad build). Commit small and often with clear messages. The rules expect
  commit history covering the build window, so never squash.

## What we're building
The **social predictions layer for sports on Monad**, starting with football, shipped as a
**mobile PWA**. Humans and AI agents both play. FPL-style picks, challenges by link, leagues and
tables, plus real stakes, all with a consumer-first UX.
- Track: **Social, Attention & Culture** (primary). Sponsor bounties: Chainlink CRE, Envio,
  Alchemy, Mera UX, Mera One Passkey Many Keys. The MetaMask Agent Wallet plugin is built too.
- **Social core**: group chats (league rooms and match rooms) where any message, a "take",
  can become a market people bet on; an Envio-ranked activity feed; community-run leagues
  with governance (members propose and vote on gameweeks and featured takes).
- **Full feature set**: markets, bets, parlays, 1v1 matchups, leagues with
  gameweeks, private markets, private leagues, reputation and badges. Never drop a
  feature; improve settlement and UX instead.
- **Stakes and points together**: every stake won or lost also moves the player's points.
  New testnet users are auto-funded with test dollars. Fiat on/off ramps come later.
- **Settlement: Chainlink CRE only.** No creator-settled markets. Custom questions are resolved
  by CRE, with an AI resolution layer where results aren't a plain score.
- **Privacy** (replaces Arcium): sealed picks until kickoff and hidden league tables until the
  gameweek ends, opened by a CRE confidential workflow.

## Product rules (non-negotiable)
- Football language only: picks, points, challenges, table, record. Never show "wallet", "gas",
  "transaction", "onchain", "token", addresses or hashes in the main flow (advanced settings only).
- Play before sign-in: visitors make picks first; one passkey prompt (Mera) only to save.
- Two equal ways in, no seed phrase, no extension: a Mera passkey, or an email code (Privy). Either
  one alone is a full account, and a fan can link the other in Profile so both open the same
  account (TerraceVault, see app/src/lib/vault.ts). A passkey account still rebuilds from the
  passkey alone on a fresh device.
- No signing pop-ups, no pending spinners: Mera signing sessions, gas topped up by the
  onboarding server, optimistic "Locked in".
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
- The Terrace idea and design system predate the hackathon; contracts, CRE workflow and
  PWA in this folder were built during the hackathon window.
- Monad testnet settlement uses CRE simulation with `--broadcast` through the mock forwarder;
  CRE supports production writes on Monad mainnet.

## DeltaV weekly updates
- Terrace has a DeltaV founder profile (https://deltav.monad.xyz/startup/terrace-social).
- After meaningful progress (a feature shipped, a milestone, real traction, a launch), ask the
  user whether to post a short weekly update to DeltaV, at most about once a week, never without
  their ok. Keep it short and factual, in their voice.
- Post with `curl -sS --fail-with-body -X POST https://deltav.monad.xyz/api/v1/weekly-updates
  -H "Authorization: Bearer $DELTAV_API_KEY" -H "Content-Type: application/json"
  -d '{"content": "...", "xLink": "<optional X post>"}'`. The key lives only in the
  DELTAV_API_KEY env var; never commit or print it.
