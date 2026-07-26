# Terrace — Design System & UI Revamp Brief

On-chain football prediction markets on Solana Mobile (Seeker).
Synced to Claude Design project **Terrace Design System**.

## Direction: "Terrace Night"
Keep the identity we already have — **stark dark canvas, Solana-green conviction,
red for the fade** — and raise the craft. The revamp is not a repaint; it is a
paradigm shift from *scrolling a list of markets* to **swiping matchday calls**,
Seeker-native. Everything below is tuned so the swipe deck feels like the
headline surface and the rest of the app frames it.

## Principles
1. **Back or fade, fast.** Every screen resolves to a green (back) / red (fade)
   decision. No ambiguous grey CTAs on the primary path.
2. **The pitch, not the ledger.** Human-readable everywhere — crests, club
   names, "@user backed Korea to score first", never base58/hex.
3. **Dark-only, high contrast.** `#0a0a0a` canvas, `#111` surfaces, white ink.
   Colour is meaning (green=YES, red=NO, amber=urgency, purple=private/Arcium).
4. **Group-chat energy.** Playful microcopy ("Bragging rights: secured"),
   confident weights (700–900), tight negative letter-spacing on headings.

## Foundations
- **Canvas** `#0a0a0a` · **Surface** `#111111` · **Raised** `#1a1a1a` · **Line** `#262626`
- **YES / back** `#22c55e` (accent), `#4ade80` (text), `#052e16` / `#14532d` (fills)
- **NO / fade** `#ef4444` (accent), `#f87171` (text), `#3b0a0a` / `#450a0a` (fills)
- **Urgency (flash/countdown)** `#f59e0b` / `#fbbf24`
- **Private / Arcium** `#a78bfa` / `#c4b5fd` on `#2e1065` / `#4c1d95`
- **Polymarket source** `#60a5fa` on `#1e3a5f`
- **Ink** `#f9fafb` primary · `#9ca3af` secondary · `#6b7280` muted · `#4b5563` faint
- **Type** system sans. Display 22–30/800 tight; title 15–18/600; body 13; meta 10–11/600 caps.
- **Radii** chip 12–16 · card 16–24 · sheet 28 · pill/avatar 999
- **Spacing** 4-based; screen gutter 18.

## Screen inventory (revamp status)
- **Home** — hero "Back your take." + gradient feature carousel + Flash row + Trending. *Adds List/Swipe toggle.*
- **Swipe deck (new)** — Tinder-stack of active matchday calls. **Headline surface.**
- **Markets** — list fallback / full catalog.
- **Create** — permissionless market form (question, expiry chips, fee, private, flash).
- **Social** — live feed + follow graph.
- **Profile** — rep badge, W/L, creator fees, Active/History (bets · parlays · matchups).

## Components covered in this project
Foundations (colour + type + spacing) · Core controls (back/fade odds, primary
CTA, filter chips, source & status badges) · Market row & Match group card ·
**Swipe card** (the revamp centrepiece) · Bet sheet · Home & Swipe screen mockups.

Cards in the Design System pane are grouped: **Foundations**, **Components**, **Screens**.
