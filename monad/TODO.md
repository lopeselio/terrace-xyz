# Terrace on Monad: next steps

Deadline: **Wed 14 Oct 2026, 03:59 UTC** (submit Tue evening). Full runbook: [README.md](README.md).
Live app: https://play.terrace.social (also https://terrace-monad.vercel.app) · Website: https://terrace.social

## Before each match day

Run both in their own Terminal tab, Mac plugged in and lid open, and leave them running until the last match settles:

```bash
cd ~/Desktop/Development/GameDev/Q1/metropolis/terrace-xyz/monad/cre && bun run matchday     # CRE settles results and takes
cd ~/Desktop/Development/GameDev/Q1/metropolis/terrace-xyz/monad/agents && bun run pundit    # The Gaffer, AI pundit agent
```

Stop with Ctrl+C after full time. Missed a match? Run the workflows by hand afterwards (see README, "Match day").

## To do

- [x] **Check the first live settlement:** Liverpool v Man City (match `1557424`, kickoff Sun 11 Oct 15:30 UTC).
      The take "Haaland scores in the first half" (market 0) should settle YES at the goal or NO at half time.
      Then tap **Collect** in the app.
- [x] **Fund the onboarding treasury** `0x7C45b7d13aCBCc0F62fb061EE05Bb2E1a4991718` with ~50 testnet MON
      (each new fan or agent gets 0.5 MON). Add testnet USDC from https://faucet.circle.com too.
- [x] **Keep the CRE broadcaster funded:** `0x901E8F75cc9F453fD9530b0C5b6763A1343949d7` (~3 MON is plenty for a few days).
      Now watched: the server watchdog (`ops/watchdog.sh`) alerts your phone below 2 MON (treasury below 15).
- [x] **Try the MetaMask plugin with a real Agent Wallet:** done 23 Oct with a Guard-mode server wallet:
      faucet claim and a $5 back on market 342, approved by email. Sends need the bundled relay
      (`terrace-relay`), because MetaMask's RPC proxy rejects Monad testnet; see the plugin README.
- [ ] **Publish the plugin to npm** (needs your security key): `cd monad/mm-plugin && npm publish --auth-type=web`,
      so anyone can `mm plugins install terrace-mm-plugin`.
- [ ] **Tell MetaMask** their RPC proxy answers `Invalid chainId` for 10143, though their server-wallet
      network list includes Monad Testnet. Drop the relay from the README once they fix it.
- [x] **Play a full loop on two phones:** take → market → back and fade, a 1v1 link, an acca, a private league
      with sealed picks and a vote. Note anything that confuses a non-crypto fan and fix it.
- [x] **Record demo videos:**
  - [x] CRE (≤ 2 min): a take compiled into a rule, then `cre workflow simulate … --broadcast` settling it on Monad
        (`bun run e2e:sealed` shows the sealed reveal in the TEE).
  - [x] MetaMask plugin (≤ 5 min): `mm terrace value`, `back --broadcast` through wallet policy, `collect`.
  - [x] Main demo: passkey sign-in on a phone, match room, take → market, league, record (Mera "stateless test":
        clear the browser or use a second device and show everything comes back).
  - [x] Envio (optional): the ranked feed and data flowing through the indexer.
- [x] **Submit on hackathon.monad.xyz:** primary track **Social, Attention & Culture**; bounties: Chainlink CRE,
      Envio, Alchemy, Mera-Powered UX, Mera One Passkey Many Keys (+ MetaMask Agent Wallet plugin if allowed).
      Include the disclosures from the README.
- [x] **Share the GitHub repo** with metropolis@hackathon.monad.xyz.

## Handy commands

```bash
cd monad/app && ./scripts/deploy.sh          # deploy the app to Vercel
git push origin main:envio                   # redeploy the hosted indexer (only after indexer changes)
cd monad/cre && bun run keys                 # show workflow key addresses (never prints secrets)
cd monad/cre && bun run e2e:sealed           # live sealed-bet → CRE reveal test
```

After running `vercel build`, restart the local dev server with a clean `.next` (`rm -rf .next && pnpm dev`).
