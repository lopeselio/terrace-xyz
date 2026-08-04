# UI Redesign — wiring & decisions needed

Tracking everything in the sportsbook redesign (`ui-redesign-sportsbook`) that needs
an API call, on-chain work, an asset, or a product decision from you. Grouped by
urgency. Nothing here blocks the visual build — but these determine whether a
screen is "real" or a shell.

Legend: 🔴 decision needed · 🟠 new wiring · 🟢 reuses existing wiring (preserved)

---

## 🔴 Product decisions (need your call)

1. ✅ **RESOLVED — keep $ / USDC.** Adopt the sportsbook layout + copy, but money stays the
   honest on-chain unit ($ / USDC), not £. `format.ts` `CURRENCY_SYMBOL = "$"`.

2. **Fractional odds everywhere.** Cents → fractional (`4/9`, `7/2`). Implied % kept only
   in the detail sheet. Implemented as a prob→fraction converter. Confirm you want
   fractional as the *primary* display (it changes how every price reads).

3. ✅ **RESOLVED — Barlow bundled.** Barlow + Barlow Condensed `.ttf` (OFL, from Google
   Fonts as the design uses) committed to `src/assets/fonts/`, loaded via `expo-font`
   (`useAppFonts` in `App.tsx`). System face falls back until loaded.

---

## 🟠 New data / API wiring

4. ✅ **RESOLVED — in-play live scores.** `hooks/useLiveFixtures.ts` polls API-Football's
   `live=all` board through one module-level store, so Home's carousel and the Flash screen
   share a single request. Foreground-gated via `AppState`, ranked by competition
   (`LEAGUE_RANK`), and matched to markets by team name (`findLiveFixture`).
   🟠 **Proxy built, not yet deployed.** `GET /football/*` on `packages/notifications-worker`
   holds the key server-side, caches per-request (live 20s, today 10 min, future dates 6h),
   and enforces a 90/day account ceiling in KV — the per-device cap can't protect the
   account because it only sees one install. Needs `wrangler secret put API_FOOTBALL_KEY`,
   a `wrangler deploy`, and `EXPO_PUBLIC_FOOTBALL_PROXY_URL` in `.env`.
   🔴 **Free plan ceiling (verified 2026-08-04).** Only `live=all` and `date=` within
   today ±1 are available. Season queries cap at 2024; `next=` is refused. The proxy cannot
   lift this — it's data access, not quota. A real matchday board wants the paid tier.
   ⚠️ The key is now set in `.env`, but none of this has been verified against live data on
   a device — the in-play carousel and the new fixture board are both typechecked and
   unit-tested only.

5. ✅ **RESOLVED — football-only catalog filter.** `utils/football.ts` is the only
   classifier, applied once in `useMarkets` so counts and empty states describe the same
   catalog. It replaced three copies that had drifted (two in `useMarkets`, one in
   `HomeScreen.matchesLeague`). Native Terrace markets are never filtered — they're
   user-authored, and keyword-dropping a fan's own market from their own feed is wrong.
   Classification is on the provider's own metadata (tags → subcategory → category), not
   title keywords: a first attempt using a keyword blocklist let "Netanyahu out by July
   31?" onto Home, because a blocklist only excludes what you thought of in advance. Every
   football event is tagged `soccer`. Verified against the live catalog: 25/39 events
   dropped, all genuinely non-football; 14 kept, all genuinely football.
   ⚠️ Note `&category=sports` is **not** respected by Jupiter's search endpoint — the
   politics and esports rows came back from a "premier league" query. Filtering must stay
   client-side.

6. ✅ **RESOLVED (with an open product question) — username + monogram identity.**
   `utils/identity.ts` derives a stable terrace pseudonym from the pubkey
   (`@offside_owl` + a two-hex-char tag) plus a deterministic monogram and colour, and takes
   an override for a real name the user owns. Wired through `useLeaderboard`,
   `useTerraceUsers`, `useHeliusEvents` (Feed), Home creator pills + notifications, Matchups,
   Leagues, Profile and the Social profile sheet. `truncatePubkey` survives for *things* —
   markets, vaults, signatures — which are legitimately addresses.
   🔴 Still your call: is there a canonical username registry, or is `.skr`/`.sol` +
   Privy handle + this pseudonym the permanent answer? The override slot is ready either way.
   ✅ **RESOLVED — settle events attributed.** `hooks/settleActors.ts` reads the creator back
   from the market/parlay account instead of waiting on a program change. Adding `settler` /
   `creator` to the events is still worth doing on the next deploy, but the client path is
   needed either way for events already on chain.

7. ✅ **RESOLVED — flash server-time countdowns + auto-lock.** `hooks/useServerTime.ts`
   takes the cluster as the clock (`getBlockTime(getSlot())`), holds the offset from device
   time, and re-syncs every 5 minutes; `msUntil()` drives every flash countdown. At T-0 the
   card locks in place — odds disabled, `CLOSED`, no tap-through — rather than vanishing
   mid-tap. If the RPC is unreachable the offset stays 0 and countdowns fall back to device
   time: slightly wrong beats stopped.

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
