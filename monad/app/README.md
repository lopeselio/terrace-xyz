# Terrace PWA (Monad testnet)

Mobile-first web app: open a challenge link, call the scores, sign in with email or
phone only when saving, share with mates, follow the table, keep your record.
No wallet UI, no gas prompts: a Privy smart wallet with a sponsored paymaster sends
every transaction for the fan.

## Run

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Open the dev URL on your iPhone (same Wi-Fi, or deploy to Vercel), then Share → Add to Home Screen.

## Privy setup (dashboard)

1. Create an app; enable **Email** and **SMS** login.
2. Enable **Smart Wallets** and add **Monad testnet (10143)** with a bundler and
   paymaster so transactions are sponsored. If Monad testnet isn't offered with a
   default paymaster, add a Pimlico or Alchemy bundler/paymaster URL for chain 10143.
3. Add your Vercel domain and `localhost` to allowed origins.

## Where things live

- `src/lib/useTerraceWallet.ts` is the only file that touches wallets.
- `src/lib/terrace.ts` holds contract reads and plain-language error messages.
- `src/lib/fixtures.ts` holds team names for the fixture ids you seed onchain.
- `src/app/c/[id]` is the challenge screen plus its WhatsApp preview image.

## Not yet included

Push notifications (add Serwist, or copy the service worker setup from Monad's
`next-serwist-privy-smart-wallet` template) and custom display names on the table.
