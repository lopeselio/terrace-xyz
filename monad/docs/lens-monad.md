# Lens on Monad: research note

Researched 19 Nov 2026 for Terrace. **Verified** means I read it in the cited source or checked it on chain.
**Unverified** means a claim I couldn't confirm. Don't build on those yet.

## Bottom line

- A Lens V3 deployment exists on **Monad testnet (10143)**. Its address book is published by
  [Parallax](https://github.com/mmv08/parallax), and the core contracts have code on chain (checked below).
- The protocol repo, [`monad-developers/lens-monad-protocol`](https://github.com/monad-developers/lens-monad-protocol),
  returns **404** to the GitHub API today, so it's private, renamed or removed. **Unverified:** its source, audit status
  and who owns the deployment. Parallax pins it at PR #4, commit `02da644a…`.
- **Monad has no hosted Lens API.** Lens's GraphQL API, SDK and auth tokens serve Lens Chain, not Monad. Any app
  on Monad reads the Lens contracts through its own indexer (Parallax uses Ponder).
- **Sponsorship on testnet is paused** in the Parallax handoff: "There are no active relayers at handoff" and
  `RELAY_PAUSED=true`. Until someone funds an allowlisted relayer, every Lens action costs the fan MON.
- **Recommendation:** don't ship a Lens prototype in Terrace yet. Every Lens action would need a Terrace relayer
  (MON spend) plus a Ponder indexer, and it would rest on unpublished protocol source. Revisit once the protocol
  repo is public and a relayer is running. `TerraceFollows` stays the source of truth either way.

## Contract addresses

**Monad testnet (10143).** These come from Parallax
[`packages/protocol/deployments/10143.json`](https://github.com/mmv08/parallax/blob/main/packages/protocol/deployments/10143.json),
deployment block `72084611`. Each address below returned contract code from `eth_getCode` on
`https://testnet-rpc.monad.xyz` today. A proxy or a beacon returns 2–3 KB of code, so the code check shows each
address is a contract, not what it does.

| Contract | Address |
|---|---|
| LensFactory (account + username in one call) | `0x0957046f904A866200d410bedEB8B62bFd16B8cc` |
| AccountFactory | `0x3badc3B2211D831d1a80401f04d2F912935FbC37` |
| LensGlobalFeed (posts) | `0xbE0051Ad59A57776Eba7180C6Ba1A69da6a6069b` |
| LensGlobalGraph (follows) | `0x984471850A114F2252316539DCae487580650CD4` |
| LensGlobalNamespace (`lens/` usernames) | `0x28c2788C71187AA905025Ed081e2bf4d18AF9f5b` |
| SponsorRouter (relayed actions) | `0xE7da6c231A7fE4fCBDd9915e244AE08D75C51009` |

**Monad mainnet (143).** Parallax's indexer config accepts chain 143, but there's no `143.json` in its repo.
**Unverified:** whether any mainnet deployment exists.

**Lens Chain mainnet**, for comparison. These are from [Lens docs → Contracts](https://lens.xyz/docs/protocol/resources/contracts):
LensFactory `0x1fa75D26819Ac733bf7B1C1B36C3F8aEF32d2Cc0`, Global Feed `0xcB5E109FFC0E15565082d78E68dDDf2573703580`,
Global Graph `0x433025d9718302E7B2e1853D712d96F00764513F`, Lens Namespace `0x1aA55B9042f08f45825dC4b651B64c9F98Af4615`.
Lens Chain is a ZKsync-based L2 ([Lens Chain overview](https://lens.xyz/docs/chain/overview)), and its accounts
aren't the same as the Monad deployment's. The Monad deployment is a fresh one: "No migration, historical accounts,
username import, or reservations are involved" ([Parallax testnet handoff](https://github.com/mmv08/parallax/blob/main/docs/monad-testnet.md)).

## Accounts, follows and posts (Parallax README)

- **Account:** a Lens `Account` smart wallet owned by the fan's own wallet. Sign-up calls
  `LensFactory.createAccountWithUsernameFree`. That creates the Account, gives it a username in the global `lens`
  namespace (at least 4 characters) and adds `SponsorRouter` as an account manager
  (`canExecuteTransactions`, `canSetMetadataURI`).
- **Follows** live on the Global Graph. **Posts** live on the Global Feed, with Lens metadata (`text-only` 3.0.0)
  inline in the content URI. **Lens V3 has no onchain likes.**
- **Paying for actions** works one of two ways:
  - Sponsored: the server checks a SIWE session, then a relayer sends `SponsorRouter.execute(account, target, data)`.
  - Direct: the fan's own wallet calls `Account.executeTransaction` and pays in MON.

## Sign in with Lens or Farcaster

- **On Lens Chain**, Lens's API issues a Lens ID token (JWT, verified against a JWKS, with an
  `ACCOUNT_OWNER` / `ACCOUNT_MANAGER` role claim) ([Lens docs → Authentication](https://lens.xyz/docs/protocol/authentication)).
  **That API doesn't cover Monad.**
- **On Monad**, "Sign in with Lens" means SIWE plus checking that the signer owns the Account, which is how
  Parallax does it. **Unverified:** the exact ownership view on `Account`, because the protocol ABI source isn't public.
- **Farcaster** is a separate network with its own sign-in ("Sign in with Farcaster"). Lens doesn't provide it.
  **Unverified** for this note; it would be its own integration.
- **In Terrace:** whichever sign-in a fan uses, Mera or Privy stays their account. A Lens or Farcaster identity
  would only be linked to it, like `/mylink` links Telegram.

## Sponsorship and relayers

- **Lens Chain** uses native paymasters: sponsors set rate limits and access lists
  ([Lens docs → Sponsorship](https://lens.xyz/docs/protocol/concepts/sponsorship)).
- **Monad** uses `SponsorRouter`. The contract owner allowlists relayers with `setRelayer(address,bool)`, and each
  relayer pays the gas.
- Parallax's relayer limits gas per action and per hour, keeps nonces in Postgres, and warns that "Monad charges
  the gas limit", so every gas estimate has to be tight.
- **For Terrace:** we would run our own allowlisted relayer funded with MON. That's the same model as the
  onboarding server that tops fans up today, and it needs the owner of the Monad deployment to allowlist us.
  **Unverified:** who that owner is.

## Indexing

- There's no Lens API on Monad. The public RPC limits `eth_getLogs` to 100 blocks and answers 429 above
  25 requests a second (Parallax `ponder.config.ts`).
- One option is to add the Lens Feed and Graph events to Terrace's existing Envio indexer as extra contracts.
- The other is to run Parallax's Ponder indexer as-is.
- **Unverified:** event ABIs, until the protocol source is public. Parallax ships ABIs in `packages/protocol`.

## A prototype, when the blockers clear

Additive and behind `NEXT_PUBLIC_LENS=1`. Nothing below changes `TerraceFollows`.
1. **Link Lens:** Profile → "Link Lens". SIWE plus an Account ownership check, stored like the Telegram link.
2. **Bring your mates:** read the fan's Global Graph follows from the indexer and offer one-tap follows on Terrace
   for any of them who are already Terrace fans.
3. **Share a take to Lens:** post a `text-only` take to the Global Feed with the `/b/<market>` link from the
   group-chat work, so Back / Fade open the bet sheet. This needs the relayer, or the fan pays in MON.

## Sources

- Parallax README, testnet handoff and address book: https://github.com/mmv08/parallax (last push 18 Oct 2026)
- Lens protocol repo: https://github.com/monad-developers/lens-monad-protocol (404 on 19 Nov 2026)
- Lens docs: authentication, sponsorship and contracts at https://lens.xyz/docs/protocol
- Lens Chain overview: https://lens.xyz/docs/chain/overview
- Monad gas pricing and RPC differences: https://docs.monad.xyz/developer-essentials/gas-pricing ·
  https://docs.monad.xyz/reference/rpc-differences
