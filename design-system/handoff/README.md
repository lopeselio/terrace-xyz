# Handoff: Terrace UI revamp (full app)

## Overview
Terrace is a football prediction-market app for mobile. This handoff is a
**complete UI redesign** of every screen: a sportsbook-grade interface benchmarked against
bet365 (dark, dense, odds-first, live-led) and Paddy Power (loud condensed type, playful
voice), while keeping Terrace's existing pure-black + Terrace-green identity.

Two rules drove every decision:
1. **Odds are the interface.** Every screen resolves to a tappable odds button.
2. **Nothing on a primary surface reads like a blockchain.**

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show
intended look, spacing, motion and behaviour. They are **not production code to copy**.
Recreate them inside the Terrace app's existing environment (React Native / Expo on the
Seeker build, repo `lopeselio/terrace-xyz`) using its established navigation, components
and data layer. Match the visuals exactly; write the code the way the app is written.

## Fidelity
**High-fidelity.** Colours, type, sizes, radii, spacing, copy and motion timings are final.
Map every value onto ONE theme module — do not leave a second source of truth for colour.

---

## The eight changes that define this revamp

### 1. Emoji are gone — a real icon set
Every 🏠 📋 👥 🏆 ⚡ 🔥 ⚽ 🎯 👕 ⏱ 🎴 ℹ ✕ ✓ in the current build is replaced by a
30-glyph line set: 24×24 grid, **1.75px stroke**, round caps/joins, `currentColor`, no fill.
Sizes in use: 14 (inline, stroke 2), 16 (buttons), 20 (default), 22 (tab bar), 26 (deck actions).
Source of truth: `icons.js` — SVG path data per name, rendered by `ic(name, sizeClass)`.
Names: home, pitch, cards, list, plus, users, trophy, search, bell, clock, bolt, flame,
chevronRight/Left/Down, close, check, arrowDown, arrowUpRight, info, lock, wallet, share,
shield, chart, ball, whistle, filter, refresh, copy, eye, swords, hourglass, dollar, minus,
crown, calendar, sliders, logout.
In React Native, ship these as `react-native-svg` components with the same names and props
`{size, color}` — or use Lucide equivalents where the path matches; do NOT mix two icon sets.

### 2. Condensed display face
- **Barlow Condensed** 600/700/800 — odds, scores, minute, big numbers, section heads,
  hero copy, screen titles. Uppercase with +0.3 to +0.6 letter-spacing for heads;
  −0.5 for the 46px hero.
- **Barlow** 400/500/600/700 — all prose, labels, meta, body.
- Nothing uses the system face any more. Bundle both families with the app.

### 3. Fractional odds + sportsbook language
Cent pricing is replaced by **fractional odds** as the primary display: `4/9`, `7/2`, `8/13`,
`11/4`. Keep implied probability available in the market detail sheet only.
Rename throughout: contract → **bet**, pool → **matched**, volume → **matched**,
"$1 per winning contract" → **potential returns**, bet amount → **stake**, place →
**Place bet**, cart → **bet slip**. Money in **£** with two decimals.

### 4. Crypto pushed into one drawer
- Identity is **@username + coloured monogram avatar** everywhere (`@mikeyd`,
  `saoirse.k`). A base58 address must never appear on a list, feed, profile header or card.
- Balance reads `£14.22` with the label **Available balance**.
- `SOL`, `Devnet`, `Mainnet`, `USDC`, the wallet address and `Non-custodial` appear **only**
  inside the **Wallet & payouts** sheet (Profile → row), and network details sit behind a
  "Show network details" toggle that is OFF by default.
- **Kept as trust badges** (small, 10px/700): `Terrace`, `Polymarket`,
  `Arcium · Private`, `Settled by Chainlink`.

### 5. Home leads with In-play
Order: **In-play now** (horizontal carousel of live matches, score + minute + 1/X/2 odds) →
**Next up · today** (fixture cards with 1/X/2) → **Flash · in-play** (one live flash market,
linking to the Flash screen) → **Your follows backed** (copyable bets) → **Your leagues**
(violet gameweek rank card: "Arcium League · gameweek 12", 2nd of 20, Season pts / This GW
"Hidden" / Pool, tapping into the league detail) → four quick-action tiles
(Flash markets / 1v1 matchups / Build a parlay / Private leagues).
The gradient category carousel is removed.

### 6. Football only
Politics, gaming, culture and world-event markets coming from the Polymarket feed are
**filtered out**. The catalog is football competitions only (Premier League, Champions
League, La Liga, Serie A, Bundesliga, World Cup). Filter at the data layer, not the UI, so
counts and empty states stay honest.

### 7. Navigation, transitions, loaders
- **Tab bar**: 5 tabs, 62px + 18px safe-area, `rgba(9,9,9,.9)` + 20px blur, 1px top hairline
  `#171717`. Each tab = 22px line icon in a 44×26 pill + 10px/600 label. Active: green
  `#22c55e` icon+label, pill background `rgba(34,197,94,.14)`. **Create** is a 46px green
  circle raised −16px with a black plus and `0 8px 20px rgba(34,197,94,.28)`.
- **Cold start**: branded splash — logo mark + wordmark, 120×3 track with a 40%-wide green
  bar sliding left→right (1.1s loop) — then onboarding/home.
- **Tab switch**: render the destination's **skeletons for 380ms**, then cross-fade the real
  content in over 260ms with an 8px upward translate, `cubic-bezier(.22,1,.36,1)`.
- **Skeletons**: `#151515 → #1f1f1f → #151515` gradient at 220% width, 1.25s linear shimmer,
  shaped like the real component (crest square, title bar, three 52px odds blocks).
- **Card → detail**: 0.97 scale press feedback, then push. Prefer a shared-element
  transition on the crest pair where the nav library supports it.
- **Sheets**: spring up from +24px with opacity 0→1, 300ms `cubic-bezier(.22,1,.36,1)`;
  scrim `rgba(0,0,0,.62)` + 2px blur; 38×4 grabber; radius 28 top corners.
- Respect reduce-motion: drop translate/rotation, halve durations.

### 8. Alignment and rhythm discipline
One **16px gutter** everywhere. 4-based spacing (4·8·12·16·24·32). Header 54px, sticky,
`rgba(10,10,10,.86)` + 18px blur. One radius per role. Every touch target ≥44px.
One accent per state — never two colours competing in a row.

---

## Screens
Each reference file is a 390×844 phone frame. Read them in order.

| # | File | Screen |
|---|---|---|
| 01 | `screen-onboarding.html` | Onboarding — hero "Back your take.", 3 value rows, no wallet jargon |
| 02 | `screen-home.html` | Home — in-play first |
| 03 | `screen-markets.html` | Markets, list mode |
| 04 | `screen-swipe.html` | Markets, swipe deck |
| 05 | `screen-detail.html` | Match detail with sticky bet slip |
| 06 | `screen-bet-sheet.html` | Bet slip sheet |
| 07 | `screen-create.html` | Create market |
| 08 | `screen-social.html` | The Feed |
| 09 | `screen-profile.html` | Profile |
| 10 | `screen-wallet.html` | Wallet & payouts sheet |
| 11 | `screen-leagues.html` | Leagues |
| — | `loaders.html` | Splash + skeletons |
| — | `Terrace Prototype.html` | Clickable prototype — nav, transitions, loaders, live swipe gestures |

### Markets — swipe deck (the headline surface)
Stack of 3 cards in a 376px stage, 16px side gutter. Top card interactive; second at
`scale(.945) translateY(13px)` opacity .5; third at `scale(.9) translateY(26px)` opacity .24.
Card: `#111`, radius 24, border 1px `#262626`, padding 16, shadow `0 10px 28px rgba(0,0,0,.45)`.
Contents: source + countdown badges → centred crest V crest with club names → competition
line → the call in Barlow Condensed 26/700 uppercase → Back/Fade odds pair → "Matched £1,240".

**Gestures** — right = back (Yes), left = fade (No), up = market detail, down = skip.
Card follows the finger 1:1; rotation `clamp(dx/20, ±12deg)`. **Commit at |dx| > 105px** or
fling velocity ≥ 0.35. Below threshold → spring home (220ms). Above → exit
`translate(±460px, −40px) rotate(±18deg)` + fade over 240ms, then the bet sheet opens
pre-set to that side. **Stamps** ("BACK" green, left, −13deg / "FADE" red, right, +13deg;
Barlow Condensed 27/800, 3px border, radius 10) fade in with `min(1, |dx|/110)`.
Haptics: light on threshold cross, medium on commit.
Buttons below mirror all four gestures — 56px fade, 44px skip, 44px detail, 56px back.
Cancelling the sheet returns the card to the deck; confirming consumes it.

---

## State Management
- `viewMode: 'list' | 'swipe'` — persisted per user, defaults to `list`.
- `competition: 'all' | 'live' | <leagueId>`, shared by both view modes.
- `deck: Market[]` — open, football, non-flash, sorted by matched desc, capped 40.
- `index`, `skipped: string[]` (re-queued on reshuffle), `dragX/dragY` as animated values
  (never React state).
- `slip: { marketId, selectionId, odds, stake } | null` — one selection at a time in v1.
- `navBusy: boolean` — blocks double navigation during the 380ms skeleton window.
- Reuse the existing markets query for both list and deck; re-read prices when a card
  becomes top card; prefetch the next 5 crests.

## Empty / loading / error
- **Deck exhausted**: "YOU'RE ALL CAUGHT UP" (Condensed 20/700 upper) + 12px/600 `#6b7280`
  sub-line + "Reshuffle skipped" text button in `#4ade80`; action row at 40% opacity.
- **Loading**: skeletons as specified — never a bare spinner on a full screen.
- **Error**: 13px `#f87171` message + "Retry" text button `#4ade80`, in the same slot.

## Design Tokens
Read `styles.css` — it is the system, with tokens as CSS variables at the top.
- Canvas `#0a0a0a` · Surface `#111111` · Raised `#1a1a1a` · Deep `#0d0d0d` · Sunken `#080808`
- Lines `#262626` / `#1e1e1e` / `#171717`
- Back `#22c55e`, ink `#4ade80`, deep `#052e16`, mid `#14532d`, glow `rgba(34,197,94,.14)`
- Fade `#ef4444`, ink `#f87171`, deep `#3b0a0a`, mid `#450a0a`
- Amber `#f59e0b` / `#fbbf24` on `#2a1605` · Violet `#a78bfa` / `#c4b5fd` on `#2e1065`
  · Blue `#60a5fa` on `#12263f`
- Ink `#f9fafb` / `#9ca3af` / `#6b7280` / `#4b5563` / `#374151`
- Radii 8 · 10 · 14 · 18 · 24 · 28 · pill — Spacing 4·8·12·16·24·32, gutter 16
- Shadows card `0 10px 28px rgba(0,0,0,.45)`, lift `0 16px 40px rgba(0,0,0,.6)`
- Easing `cubic-bezier(.22,1,.36,1)` for everything

## Assets
- **Crests**: real club badges from a crest CDN, keyed by club code, cached on device;
  fallback is the coloured square with the 3-letter code in Barlow Condensed 700 white
  (colours in `screens.js` → `CLUB`). Sizes 34 (radius 9) and 52 (radius 14).
- **Avatars**: no photos — 2-letter monogram on a per-user deterministic colour, pill radius.
- **Logo**: black rounded square, white "T", green dot bottom-right (`.logo-mark` in
  `styles.css`); wordmark "TERRACE" in Barlow Condensed 700 uppercase.
- **Fonts**: Barlow + Barlow Condensed (Google Fonts, OFL) — bundle, don't fetch at runtime.

## Suggested order of work
1. Theme module + fonts + the icon set (unblocks everything, deletes all emoji).
2. Primitives: odds button, badge, chip, segmented control, card, crest, avatar, switch, CTA.
3. Tab bar + navigation shell + skeleton/cross-fade transition + branded splash.
4. Markets (list) → market detail → bet slip sheet — the money path.
5. Swipe deck on top of the same data.
6. Home (in-play carousel needs a live-score subscription).
7. Feed, Profile, Wallet sheet, Leagues, Create.
8. Onboarding, empty/error states, haptics, reduce-motion.

## Files in this bundle
`styles.css` (the system) · `icons.js` · `screens.js` + `screens2.js` (screen markup) ·
`Terrace Prototype.html` (clickable) · the 12 screen references · `components.html` ·
`foundations.html` · `brief.md`.
Open `Terrace Prototype.html` first — it is the fastest way to feel the intended motion.


---

## Addendum — the four features that previously had no UI

These were not in the original screenshots because they aren't implemented (or had no open
markets on-chain). Designs are now in the bundle; behaviour below is what the UI assumes.

### Flash markets — `screen-flash.html`
In-play only, always scoped to one live match.
- **Match header card**: `#180f0f → #0f0f0f` gradient, border `#3a1f1f`, LIVE badge +
  pulsing dot + minute badge, "Half time in 7'" on the right, crest / score / crest row.
- **Chip row** filters by fixture, not league ("Arsenal v Chelsea", "Man Utd v Spurs").
- **Grouped by window**: section head "Before half time" in `#fbbf24` with a "Closes 7'"
  badge, then "Later in the match".
- **Market card**: question 14.5/600, sub "fixture · market type" 11.5 `#6b7280`, amber
  countdown badge, Back/Fade odds pair.
- Copy pattern for market names: `<Player> to score before half time`,
  `<Team> to score in extra time`, `Booking in the next 10 minutes`,
  `<Player> to assist in the second half`.
- **Countdowns tick every second** and must come from server time, not device time. At
  T-0 the card locks: odds buttons `disabled` (35% opacity), badge switches to
  "Closed" `b-settled`. Flash markets never appear outside a live match.
- Home surfaces one Flash card ("Flash · in-play" section) linking to this screen.

### 1v1 matchups — `screen-matchups.html`, `-active.html`, `-inbox.html`
Segmented **New / Active (n) / Inbox (n)**.
- **New**: market picker row (crest pair + question) → **Your side** as the Back/Fade odds
  pair (selecting one implicitly assigns the opponent the other — state that in a caption)
  → **Opponent** row opening a "Pick your opponent" sheet listing people you follow with
  win rate and streak, plus "Invite by link instead" → **Stake — equal on both sides**
  (£1/£5/£10/£25) → summary card "You stake / They stake / **Winner takes £10.00**" →
  `Send challenge`. Caption: expires if not accepted before kick-off.
- **Confirmation sheet**: swords glyph, "CHALLENGE SENT", who has until when, View matchups.
- **Active**: one card per matchup — direction line ("You challenged" / "Accepted"),
  avatar + username, state badge (Active / Waiting / Won / Lost), the question,
  then `You: Yes` + `£5 each` + the pot in Barlow Condensed green.
- **Inbox**: incoming challenge card is green-bordered, shows *their* side and *your*
  implied side, hourglass badge with time left, and a two-button row **Accept · £5** /
  **Decline**. Resolved-but-unsettled matchups get a ghost **Settle matchup** button.
- Never show a base58 address in any of these — username or "Invite by link".

### Parlays — `screen-parlay.html`, `screen-parlay-slip.html`
- Filter chips (All football / Live / competition), then **Open markets · n** and a list of
  **leg cards**: 22px square checkbox (green filled + check when selected), question,
  "fixture · market type", price right-aligned in Barlow Condensed. Selected card gets
  `border:var(--green)` and `background:#0c1710`.
- **Slip bar** persists at the bottom: leg count in a dark circle, "3-leg parlay",
  combined odds. Enabled only at **2–8 legs**; below 2 it reads "Pick 2 legs to start".
- **Slip sheet**: every leg with its price, a **Combined odds** row, stake field,
  **Potential returns**, `Place parlay · £10`, and the caption "One leg lost and the
  parlay is gone. No cash out on parlays yet."
- Combined price = product of decimal equivalents, re-rendered on every leg toggle and
  on any live price move; if a leg's price moves after selection, flag that leg amber and
  require re-confirmation rather than silently repricing.
- **Empty state** (the real case today): "No open markets in football right now" plus a
  "Create a market" link — never an empty list under a live header.

### Leagues — `screen-league-detail.html`, `-create.html`, `-join.html`
- Segmented **Mine / Create / Join** on all three.
- **Create**: league name, size segmented (10/20/50/100), entry fee (Free/£1/£2/£5) with
  the caption that entries form the prize pool, and one privacy switch —
  "Hide standings until reveal" with the `Arcium` badge, ON by default.
- **Join**: invite code field + `Join league`, then an "Open to join" list with member
  count and entry fee.
- **Detail**: violet gradient card (`#160f28 → #0f0f0f`, border `#3b2d6b`) reading
  "GAMEWEEK 11 REVEALED / 4 pts / 2nd of 20 · 4 points off the top" with the Arcium badge;
  three stat tiles (Season pts / Rank / Prize pool in amber); Share invite + Copy link;
  then **two leaderboards** — the current gameweek with every row's score replaced by a
  `Hidden` lock badge and a "Hidden until Sunday" section badge, and the previous
  gameweek shown revealed below it. Your row is highlighted `#0c1710` with "You" in green.
  Position colours: 1st `#fbbf24`, 2nd `#cbd5e1`, 3rd `#b98155`, rest `#4b5563`.
- Entry points: Profile → **Play** tiles (1v1 matchups / Build a parlay / Private leagues),
  and Home → Flash markets tile.

### Files added
`screens3.js` (all four features' markup) and cards 12–20. Every card and the prototype
now load `icons.js → screens.js → screens2.js → screens3.js` in that order.
