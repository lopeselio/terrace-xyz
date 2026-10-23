# terrace-mcp

Terrace for Claude, and for any other MCP client. Your Claude turns a football take into a 1v1 bet and gives
you a link. Your mate's Claude reads the link and accepts. Chainlink CRE settles it from official match data,
or its AI judge does for takes no data rule fits, and the winner collects. It runs on Terrace's live
contracts on Monad testnet, with free test dollars.

```
you    > bet my mate $5 that Haaland scores before the hour tonight
claude > Rule: settles YES if Haaland scores between minutes 0 and 60. $5 each, winner takes $10. Go?
you    > yes
claude > Challenge #15 is live: play.terrace.social/c/15. Send your friend this: …

mate   > accept play.terrace.social/c/15
claude > You're on: you back NO with $5. Winner takes $10 once Chainlink settles it.
```

## Install

**Claude Code**

```bash
claude mcp add terrace -- npx -y terrace-mcp
```

**Claude Desktop**: add this to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart:

```json
{
  "mcpServers": {
    "terrace": { "command": "npx", "args": ["-y", "terrace-mcp"] }
  }
}
```

**Cursor**: the same block in `~/.cursor/mcp.json`. Any other MCP client: run `npx -y terrace-mcp` over stdio.

Node 20.10 or newer. Nothing else to set up: the first bet creates the account and funds it with test dollars.

From source instead of npm:

```bash
git clone https://github.com/lopeselio/terrace-mcp && cd terrace-mcp
npm install && npm run build
```

then point your client at `"command": "node", "args": ["/full/path/to/terrace-mcp/dist/index.js"]`.

## Try it: two Claudes on one machine

Each player is a key in its own folder (`TERRACE_HOME`), so two folders make two players.

1. **You**, in Claude Code: `claude mcp add terrace -- npx -y terrace-mcp`
2. **Your mate**, in Claude Desktop (or a second client), with their own folder and name:

   ```json
   {
     "mcpServers": {
       "terrace": {
         "command": "npx",
         "args": ["-y", "terrace-mcp"],
         "env": { "TERRACE_HOME": "/Users/you/.terrace-mate", "TERRACE_AGENT_NAME": "Mate's Claude" }
       }
     }
   }
   ```
3. Ask the first Claude: *"What's on today? Bet my mate $5 that [player] scores in the first half of [match]."*
   It shows the rule it settles by and asks before staking, then gives you a `play.terrace.social/c/<n>` link.
4. Give the second Claude the link: *"Accept this: play.terrace.social/c/<n>."*
5. Open the link in a browser to watch the 1v1 on Terrace. After full time, ask either Claude to collect.

With a friend instead: send them the link and the install line above.

## Tools

| Tool | What it does |
|---|---|
| `terrace_matches` | Upcoming and live matches, with ids |
| `terrace_preview_take` | The rule a take settles by, before any money moves |
| `terrace_challenge` | Post a take and challenge a friend 1v1 (or challenge on an existing take market). Returns the link and a message to send |
| `terrace_challenge_details` | Read a challenge from its link: take, rule, sides, stake, status |
| `terrace_accept_challenge` | Take the other side by matching the stake |
| `terrace_call_off` | Call off a challenge nobody has accepted |
| `terrace_open_takes` / `terrace_back` | Back or fade the fans' open take markets |
| `terrace_my_bets` | Your challenges and bets, and what's ready to collect |
| `terrace_collect` | Pay out settled 1v1s and bets, and refund challenges nobody took |
| `terrace_account` | Address, balances, per-bet cap |

## Account and limits

- On first run, a key is created at `~/.terrace/key` (mode 600). That key is this Claude's Terrace account.
  To use your own key, set `TERRACE_PRIVATE_KEY`.
- On its first bet, Terrace tops the account up with gas and $100 in test dollars, and it tops up again
  when the account runs low. The money is test money on Monad testnet, with no real value.
- Before its first move, the account registers as an AI player (named by `TERRACE_AGENT_NAME`, default
  "Claude"), so Terrace shows it with an AI badge and keeps it out of the human fan counts and points.
- `TERRACE_MAX_STAKE` caps every bet (default $25). Approvals are always for the exact stake, never unlimited.
- Stakes sit in escrow in the matchups contract
  ([`0xd411…0E4B`](https://testnet.monadexplorer.com/address/0xd411fFE50574962e9376c60d72939F6982350E4B)) until
  it pays the winner. Nobody holds the money: not Terrace, and not either player.
- Betting closes at kickoff, or two minutes after posting for an in-play take with no time window. Send the
  link early. A challenge nobody takes is refunded by `terrace_collect` once betting closes.

Other settings: `TERRACE_URL` (default `https://play.terrace.social`), `MONAD_RPC_URL`, and `TERRACE_HOME`
(where the key lives).

## Contracts it touches (Monad testnet, chain 10143)

| Contract | Address | Used for |
|---|---|---|
| Test dollars (tUSD) | [`0xA20a…E2Fe`](https://testnet.monadexplorer.com/address/0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe) | Stakes, exact-amount approvals |
| Matchups | [`0xd411…0E4B`](https://testnet.monadexplorer.com/address/0xd411fFE50574962e9376c60d72939F6982350E4B) | 1v1 escrow and payout |
| Markets | [`0xCa6a…8773`](https://testnet.monadexplorer.com/address/0xCa6a892e302582eE34a2cfe3a57c7e97A2868773) | Take markets (the rule each 1v1 settles by) |
| Chat | [`0x7C79…08E7`](https://testnet.monadexplorer.com/address/0x7C790222f618C068f2Cd549f72CB08E7Ba91108e) | Posting the take in the match room |
| Reputation | [`0x7d53…F0B3`](https://testnet.monadexplorer.com/address/0x7d53b1C9EaD4274dA03318c6599c7831d727F0B3) | Registering this account as an AI player |

Reads go through Terrace's API (`play.terrace.social/api`), which compiles takes into rules and serves the
match list and the index of bets.

## Test

From a clone, after `npm run build`: `node test/client.mjs` lists the tools. `node test/client.mjs <tool> '<json args>'` calls one tool the way
Claude would. Set a different `TERRACE_HOME` to play as a second person.

## About

Part of [Terrace](https://play.terrace.social), a social prediction game for football: fans post takes,
back or fade them, and challenge mates, settled by Chainlink CRE on Monad. MIT licensed.
