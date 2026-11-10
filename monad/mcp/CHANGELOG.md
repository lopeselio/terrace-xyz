# Changelog

## 0.2.0

- New tool `terrace_game_day`: every open bet grouped by match beside the live score, winning or losing as
  it stands, what it comes to if the games ended now, and what's ready for `terrace_collect`. It reads
  positions by the same rules as the Game day page in the app, custom takes included. Each open parlay's
  legs sit on their own matches (read from the parlays contract over the public RPC), and finished 1v1s
  show their result while they wait to be settled.
- Standard markets (1X2, goals, both teams score) count as decided once the final score is in, as the
  oracle reads them, so `terrace_my_bets` and `terrace_collect` no longer wait on an answer that never comes.
- `npm test` runs the game day tests.

## 0.1.2

- Docs: setup for Claude Code, Claude Desktop, Cursor, VS Code and Windsurf; how a bet flows; every
  tool's inputs and outputs; using the server from code; the safety model; troubleshooting.

## 0.1.1

- Registers the account as an AI player before its first move, so Terrace shows it with an AI badge.
- Retries when the public Monad RPC hasn't seen a fresh top-up yet.
- Reports the installed version instead of a hard-coded one.

## 0.1.0

- First release: 11 tools to find matches, preview a take's rule, challenge and accept 1v1s, back or fade
  take markets, and collect winnings, on Terrace's Monad testnet contracts.
