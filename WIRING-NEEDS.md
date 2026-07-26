# UI Redesign — wiring & decisions needed

Tracking everything in the sportsbook redesign (`ui-redesign-sportsbook`) that needs
an API call, on-chain work, an asset, or a product decision from you. Grouped by
urgency. Nothing here blocks the visual build — but these determine whether a
screen is "real" or a shell.

Legend: 🔴 decision needed · 🟠 new wiring · 🟢 reuses existing wiring (preserved)

---

## 🔴 Product decisions (need your call)

1. **£ currency vs USDC.** The design shows `£14.22`, `Winner takes £10.00`, stakes in
   `£`. On-chain settlement is **USDC** (and SOL for gas). Options:
   - **(A, default)** Treat `£` as a pure display relabel of USDC, 1:1, no FX. Fast,
     but £1 ≠ $1 in reality. Implemented now in `format.ts` behind `formatMoney()`.
   - **(B)** Apply a live GBP/USD rate (needs an FX feed) — USDC stays the on-chain unit.
   - **(C)** Keep `$`/USDC labels, adopt only the sportsbook layout.
   I've defaulted to **(A)** so the UI reads as designed; flip with one flag in `format.ts`.

2. **Fractional odds everywhere.** Cents → fractional (`4/9`, `7/2`). Implied % kept only
   in the detail sheet. Implemented as a prob→fraction converter. Confirm you want
   fractional as the *primary* display (it changes how every price reads).

3. **Font licensing / bundling.** Design mandates **Barlow + Barlow Condensed** bundled
   (OFL, free). Need the `.ttf` files committed to `assets/fonts/`. I can fetch them from
   Google Fonts and wire `expo-font`, or you drop them in. Until then the app falls back
   to the system face (layout unaffected, just not the condensed look).

---

## 🟠 New data / API wiring

4. **In-play live scores** (Home "In-play now" carousel, live badges, Flash header).
   Needs a live-score subscription: score + minute + status, polled/streamed. Partial
   groundwork exists in `useLiveFixture` (API-Football style). Needs: a list endpoint of
   *currently live* football fixtures (not per-match lookup) to power the carousel.

5. **Football-only catalog filter** (design change #6). Filter the Polymarket/Jupiter feed
   down to football competitions **at the data layer** (so counts/empty states stay honest).
   Needs a competition classifier on the markets query (`useMarkets`). Non-football markets
   (politics, crypto, culture) are dropped.

6. **Username + monogram identity** (design change #4 — no base58 on any surface).
   Everywhere a creator/bettor/opponent appears we must show `@username` + a colour
   monogram. `useTerraceUsers` gives display names for *some* wallets; unknown wallets need
   a deterministic monogram fallback (initials from pubkey) — never the raw address.
   Open question: is there a canonical username registry, or is it Privy-linked handle +
   fallback? Affects Feed, Profile, Matchups, Leagues, market creator pills.

7. **Flash markets — server-time countdowns + auto-lock.** Countdowns must tick from
   **server time**, not device time, and the card must lock (odds disabled, "Closed" badge)
   at T-0. Needs a server time source (or trusted offset) and the flash-market close time on
   the market record.

8. **Parlay live re-pricing.** Combined odds = product of legs' decimal odds, re-rendered on
   every toggle and on any live price move; if a selected leg's price moves, flag that leg
   **amber** and force re-confirm. Needs live price refresh on the selected legs.

---

## 🟢 Existing on-chain / client wiring to PRESERVE (reused, not rebuilt)

The redesign is a **visual reskin over the working data layer** — every one of these keeps
its current hook and on-chain flow; only the presentation changes.

9. **Place bet** — `usePlaceBet` (native Terrace + Jupiter). Bet slip sheet reuses it.
10. **Parlays** — `useParlay` (create/submit/claim). Parlay + slip screens reuse it.
11. **1v1 Matchups** — `useMatchup` (create/accept/decline/settle) + follow graph for the
    opponent picker (`useFollowing` / `useTerraceUsers`).
12. **Leagues** — `useLeague` (create/join/record-win/advance-gameweek), private standings
    via Arcium reveal. League screens reuse it; "Hidden until reveal" = existing MPC gate.
13. **Private markets** — `usePrivateMarket` (Arcium). `Arcium · Private` trust badge kept.
14. **Reputation / profile stats** — `useReputation`, `useBets`, `useCreatedMarkets`,
    `useWalletBalances`, `useSnsName`. Profile + Wallet sheet reuse them.
15. **Live feed** — `useHeliusEvents` + follow graph. Feed screen reuses it (already
    human-readable; redesign restyles + keeps Tail).
16. **Settle / claim** — `useSettleMarket`, `useClaimWinnings`. Kept behind the new UI.

---

## 🟠 Assets / infra

17. **Club crests** by club code from a CDN, cached; coloured-code square fallback. Partly
    covered by `teamDatabase.ts` (ESPN CDN ids) — needs extending to the design's `CLUB`
    colour map and 34/52px crest sizes.
18. **Icon set** — 40 line glyphs shipped as `Icon.tsx` (react-native-svg). ✅ done this phase.
19. **Nav shell** — new tab bar (raised green Create button), branded splash, 380ms skeleton
    + 260ms cross-fade tab transitions, sheet spring, reduce-motion. UI-only; no backend.

---

_Updated as the build progresses. Ask me to expand any line into a task._
