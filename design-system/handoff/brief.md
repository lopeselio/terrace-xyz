# Terrace — Design System & UI Revamp Brief

Football prediction markets on mobile, rebuilt to read like a
sportsbook, not a crypto app. Synced to Claude Design project **Terrace Design System**.

## Direction: "Terrace Night"
Pure-black canvas and Terrace-green conviction are kept. Everything else is
re-crafted against **bet365** (dark, dense, odds-first, live-led) and
**Paddy Power** (loud condensed type, playful voice). Two rules drove every
decision: **odds are the interface**, and **nothing on a primary surface reads
like a blockchain**.

## What changed in this pass
1. **Emoji are gone.** A 30-glyph line icon set (24 grid, 1.75 stroke, currentColor)
   replaces every 🏠📋👥🏆⚡🔥⚽ in the app. See Foundations.
2. **Condensed display face.** Barlow Condensed 700/800 for odds, scores, minutes,
   section heads and hero copy; Barlow for prose. Numbers now look like a sportsbook.
3. **Fractional odds** (4/9, 11/4, 8/13) replace cent pricing everywhere, with
   sportsbook language: stake, potential returns, bet slip, place bet.
4. **Crypto pushed to one drawer.** Usernames + avatars everywhere (@mikeyd, never
   base58). Money in £. Token / network / address / non-custodial live only in
   the **Wallet & payouts** sheet, behind a "Show network details" toggle.
   Network and settlement names stay as small trust badges.
5. **Home leads with In-play.** Live matches first, then today's fixtures, then what
   your follows backed — the bet365 model, not a gradient category carousel.
6. **Football only.** Politics, gaming and event markets from the Polymarket feed are
   out of scope; the catalog filters to football competitions.
7. **Navigation, transitions, loaders.** 5 tabs redesigned (line icons, green active
   pill, blurred bar, safe-area padding, raised Create). Cold start = branded splash;
   tab switch = per-component skeletons for ~380ms then a 260ms cross-fade; cards
   scale-tap into detail; sheets spring up.
8. **Alignment discipline.** One 16px gutter, 4-based spacing, one card radius per
   role, every touch target ≥44px, one accent per state.

## Foundations
- **Canvas** `#0a0a0a` · **Surface** `#111111` · **Raised** `#1a1a1a` · **Line** `#262626`
- **Back / YES** `#22c55e`, ink `#4ade80`, fills `#052e16` / `#14532d`
- **Fade / NO** `#ef4444`, ink `#f87171`, fills `#3b0a0a` / `#450a0a`
- **Urgency** `#f59e0b` / `#fbbf24` · **Private (Arcium)** `#a78bfa` on `#2e1065` · **Source** `#60a5fa` on `#12263f`
- **Ink** `#f9fafb` · `#9ca3af` · `#6b7280` · `#4b5563`
- **Type** Barlow Condensed 600–800 (display/odds) + Barlow 400–700 (UI)
- **Radii** 8 badge · 10 odds · 14 control · 18 card · 24 swipe card · 28 sheet · pill
- **Spacing** 4-based, 16px gutter, 54px header, 62px tab bar + 18px safe area

## Screens (all in the Screens group)
01 Onboarding · 02 Home (in-play) · 03 Markets list · 04 Markets swipe deck ·
05 Match detail · 06 Bet slip sheet · 07 Create market · 08 The Feed ·
09 Profile · 10 Wallet sheet · 11 Leagues · 12 Flash markets ·
13–15 1v1 matchups (new / active / inbox) · 16–17 Parlay builder + slip ·
18–20 League detail / create / join

## The four features that had no UI yet
- **Flash markets** are in-play only and always tied to a live match: a live score header
  pins the fixture, then markets group by window — **Before half time** (Cunha to score
  before half time, another goal before the break, booking in the next 10 minutes) and
  **Later in the match** (Man Utd to score in extra time, Bruno to assist in the second
  half). Every card carries a live countdown to its own close, amber not green, because
  the deadline is the product.
- **1v1 matchups** read as a challenge, not a form: pick the call → pick your side (the
  opponent automatically takes the other) → pick a person you follow (never an address) →
  one equal stake with a "Winner takes £10.00" summary. Three tabs: New / Active / Inbox,
  with Accept · Decline on incoming and Settle on resolved ones.
- **Parlays** are a leg picker with checkbox cards over open football markets; combined
  odds live in a persistent slip bar, and the slip sheet lists every leg with its price,
  the combined price, stake and returns. Empty state names the reason ("No open markets
  in football right now") instead of showing an empty list.
- **Leagues** get Mine / Create / Join, plus a detail screen with a gameweek leaderboard
  that respects Arcium: rows show **Hidden** locks until reveal, and the previous
  gameweek is shown revealed underneath so the mechanic is legible.

## Files
- `styles.css` — tokens + every component class (the system)
- `icons.js` — the icon set, `ic(name, sizeClass)`
- `screens.js` / `screens2.js` — screen markup, shared by the cards and the prototype
- `Terrace Prototype.html` — clickable app: nav, transitions, loaders, live swipe gestures
- `design_handoff_terrace_revamp/` — Claude Code handoff package
