# Terrace group-chat bot

Turns group-chat banter into Terrace markets without anyone leaving the chat. Someone tags the bot
with a take, the bot answers with the rule in plain English and two buttons, **Back it** and **Fade it**,
and each button opens Terrace with the take, side and stake already filled in. Fans confirm with their
own passkey or email account, exactly as they would in the app.

The bot never holds keys or funds. It only reads Terrace (the match list, the take compiler and the
indexer) and posts to Telegram. Markets are created by the fans' own accounts through the existing
contracts, and settlement stays with Chainlink CRE.

## In a group

| Say | Bot does |
|---|---|
| `@TerraceBot Saka scores Sunday, 10` or `/take Saka scores Sunday` | Finds the match, runs the take compiler, replies with the rule, match, kick-off and lock time, plus Back it / Fade it. A trailing `, 10` / `£10` / `for 10` is the stake (default $5). |
| Tap **Back it** / **Fade it** | Before the market exists: Terrace's take sheet, prefilled; the first fan in opens the market on their side. After: the take in its match room with the bet sheet open. |
| `/markets` | This chat's open takes, with fans in and pot. |
| `/table` | This chat's table: points and record for everyone who used `/mylink`. |
| `/mylink` | A one-time link (private chat, 10 minutes) that ties your Terrace account to your Telegram name. You sign one message in Terrace; nothing is spent. |
| "VAR robbed us @TerraceBot" | "I don't referee the referee." |

While a match is on, every chat with an open market on it gets goals, cards, half-time and full-time,
batched so a flurry is one message. After CRE settles, the bot posts the result, where it came from,
and the winners by name (Telegram names for linked fans, Terrace fan names otherwise; never addresses).
Voids read as "refunded".

## How it works

```
Telegram ──webhook──► src/server.ts ─► src/bot.ts ──► Terrace /api/matches, /api/compile-take
                         │  /go/<take>?side=  ──302──► play.terrace.social/take?… or /m/<id>?bet=…#take-<n>
                         │  /link  ◄── signed one-time code from /link/telegram
                         ▼
                  SQLite (src/store.ts): pending takes, chat ↔ market, chat ↔ fixture, account links
                         ▲
   src/watch.ts  claim: indexer TakeListed markets matching a pending take (same match + words) → chat
                 settle: Question.answer set by CRE → result card to every chat holding the market
   src/fanout.ts one read per fixture per round (not per chat) → debounce → src/ratelimit.ts queue
```

- **Rate limits:** one message a second per chat, 18 a minute per group, 25 a second overall;
  queued live updates for the same match merge into one message; `retry_after` pauses the queue.
- **Points:** takes listed from a group carry a flag in the top bit of `chatRef` (`GROUP_REF` in
  `app/src/lib/play.ts`, only set when `NEXT_PUBLIC_GROUP_POINTS=1`). The indexer marks those markets
  `fromGroup` for counting, but awards nothing for it: anyone can set the bit, so it can't carry points until
  a trusted source (the bot) vouches for the take. Fans still earn the normal take, listing and bet points.

## Setup

1. **Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather): `/newbot`, pick a name and
   a username (e.g. `TerraceBot`). Copy the token. Then `/setprivacy` → your bot → **Enable** (the bot only
   needs commands and messages that mention it), and `/setjoingroups` → **Enable**.
2. **Configure.** `cp .env.example .env` and fill in:

   | Variable | |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | From BotFather. Secret. |
   | `TELEGRAM_WEBHOOK_SECRET` | Any long random string; Telegram sends it back on every webhook call. |
   | `BOT_PUBLIC_URL` | Public https URL of this server. Webhook is `$BOT_PUBLIC_URL/telegram`. |
   | `TERRACE_URL` | Terrace app, default `https://play.terrace.social`. |
   | `BOT_DB` | SQLite file, default `./bot.sqlite`. Keep it on a persistent disk. |
   | `BOT_TZ` | Time zone for kick-off and lock times, default `Europe/London`. |
   | `BOT_DEFAULT_STAKE` | Stake when the take doesn't say, default 5. |
   | `MONAD_RPC_URL` | Used to check `/mylink` signatures, default public Monad testnet RPC. |

   In the app (Vercel), set `NEXT_PUBLIC_TELEGRAM_BOT_URL` to `BOT_PUBLIC_URL` so the link page only ever
   talks to your bot.
3. **Run.** `bun install && bun start` (port `PORT`, default 8787). It can run on the same machine as the
   CRE match-day runner; it needs no CRE keys.
4. **Point Telegram at it.** `bun run webhook` sets the webhook and the command menu.
5. **Add it to a group.** Group → Add members → search the bot's username. Then try
   `/take Arsenal win Sunday`.

## Tests

```bash
bun test          # parsing, chat ↔ market mapping, fixture fan-out, debounce, rate limits, settlement text, mocked group flow
bun run typecheck
```

`scripts/e2e.ts` walks the full loop in a real test group (take → two fans back/fade through the
links → CRE settles → result posts → collect). It only runs the CRE broadcast with `--broadcast`, and
asks before it does.

## Known gaps

- A pending take is matched to its market by match + exact words. If a fan edits the take text in the
  sheet before publishing, the market still opens on Terrace but the group isn't told.
- Two chats posting the identical take on the same match: the first market goes to the older take.
- `/table` only knows fans who ran `/mylink` and have spoken in the chat since the bot joined.
- Live updates come from Terrace's match list (score and status) every 30s. Cards and scorers need an
  events feed, which `FixtureHub` accepts but isn't wired to API-Football yet.
- Takes compile against the app's `/api/compile-take`, so the bot shares its AI quota and outages.
- One process: the SQLite store and the send queue are local. Run one instance per bot token.
