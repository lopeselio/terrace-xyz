# terrace-mcp

[![npm](https://img.shields.io/npm/v/terrace-mcp?color=2bd46b&label=npm)](https://www.npmjs.com/package/terrace-mcp)
[![license](https://img.shields.io/npm/l/terrace-mcp?color=2bd46b)](LICENSE)
[![node](https://img.shields.io/node/v/terrace-mcp?color=2bd46b)](package.json)
[![MCP](https://img.shields.io/badge/MCP-stdio-2bd46b)](https://modelcontextprotocol.io)

**Peer-to-peer football bets between AI agents, over MCP.** Your Claude turns a take into a 1v1 bet and
hands you a link. Your mate's Claude reads the link and accepts. Chainlink CRE settles it from official
match data and the winner collects. No app, no wallet setup, no sign-up: one install line and a sentence.

It runs on [Terrace](https://play.terrace.social)'s live contracts on Monad testnet, with free test dollars.

```
you    > what's on tomorrow? I'm after Villa v City
claude > Villa v City, Sat 24 Oct 11:30 UTC (match 1557438). What's your take?
you    > I reckon City win at Villa Park. Bet my mate $10 on it
claude > Rule: settles YES if City (the away side) score more goals than Villa at full time.
         $10 each, winner takes $20, settled by Chainlink. Go?
you    > yes
claude > Challenge #16 is live: play.terrace.social/c/16. Send your mate this: …

mate   > accept play.terrace.social/c/16
claude > Challenge #16: City win at Villa Park. You'd back NO with $10. Accept?
mate   > yes
claude > You're on. Winner takes $20 once Chainlink settles it.
```

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Install in your client](#install-in-your-client)
- [Two Claudes on one machine](#two-claudes-on-one-machine)
- [Tools](#tools)
- [Use it from code](#use-it-from-code)
- [Configuration](#configuration)
- [Safety model](#safety-model)
- [Contracts](#contracts-monad-testnet-chain-10143)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Quick start

Needs Node 20.10 or newer.

```bash
claude mcp add terrace -- npx -y terrace-mcp
```

Then ask Claude: *"Show my Terrace account"*, then *"What matches are on today?"*. That's all the setup: the
first bet creates the account and funds it with $100 in test dollars and gas.

## How it works

```
  your Claude                     Terrace                       your mate's Claude
  ───────────                     ───────                       ──────────────────
  "City win at Villa Park"  ──►  /api/compile-take
                                  plain words → a rule CRE can check
                           ◄──   "YES if City outscore Villa at FT"
  you say yes
  terrace_challenge        ──►   take posted in the match room,
                                  listed as a market, your $10 in
                                  escrow (Matchups contract)
                           ◄──   play.terrace.social/c/16  ──────────►  terrace_challenge_details
                                                                        mate says yes
                                  mate's $10 joins the escrow  ◄──────  terrace_accept_challenge

  ── full time ──────────►   Chainlink CRE reads official match data (or its AI judge, for
                             takes no data rule fits) and writes the result on-chain

  terrace_collect          ──►   winner gets both stakes   ◄──────────  terrace_collect
```

- **Each MCP client is its own player.** On first run the server makes a key on that machine
  (`~/.terrace/key`). Two clients with two keys are two players, so Claude can bet Claude.
- **Takes are plain English.** Terrace compiles a take into a rule against match data (goals, scorers,
  assists, minutes, cards, corners, shots, possession, player stats) before any money moves, and Claude
  shows you that rule. Subjective takes go to Chainlink CRE's AI judge after full time.
- **Nobody holds the money.** Stakes sit in the Matchups contract until the result lands, then pay out to
  the winner. Terrace can't move them, and neither player can.
- **The bet is visible to humans too.** Every challenge has a page (`play.terrace.social/c/<n>`) and its
  take appears in the match room in the Terrace app, where fans can back or fade it.

## Install in your client

The server speaks MCP over stdio. Any client that can run `npx -y terrace-mcp` works.

<details open>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add terrace -- npx -y terrace-mcp
```

Add `-s user` to have it in every project, and `-e` to set options:

```bash
claude mcp add terrace -s user -e TERRACE_AGENT_NAME="Eli's Claude" -- npx -y terrace-mcp
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Settings → Developer → Edit Config, add this to `claude_desktop_config.json`, and restart Claude Desktop:

```json
{
  "mcpServers": {
    "terrace": { "command": "npx", "args": ["-y", "terrace-mcp"] }
  }
}
```

Then make sure the **terrace** connector is switched on in the chat's tools menu (the `+` button → Connectors).
</details>

<details>
<summary><b>Cursor</b></summary>

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "terrace": { "command": "npx", "args": ["-y", "terrace-mcp"] }
  }
}
```
</details>

<details>
<summary><b>VS Code (Copilot agent mode)</b></summary>

`.vscode/mcp.json`:

```json
{
  "servers": {
    "terrace": { "type": "stdio", "command": "npx", "args": ["-y", "terrace-mcp"] }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "terrace": { "command": "npx", "args": ["-y", "terrace-mcp"] }
  }
}
```
</details>

<details>
<summary><b>From source</b></summary>

```bash
git clone https://github.com/lopeselio/terrace-mcp && cd terrace-mcp
npm install && npm run build
```

Then point your client at `"command": "node", "args": ["/full/path/to/terrace-mcp/dist/index.js"]`.
</details>

## Two Claudes on one machine

Each player is a key in its own folder (`TERRACE_HOME`), so two folders make two players. This is how the
demo was made: Claude Code against Claude Desktop on one Mac.

1. **You**, in Claude Code: `claude mcp add terrace -- npx -y terrace-mcp` (uses `~/.terrace`).
2. **Your mate**, in Claude Desktop, with a folder and name of their own:

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
3. Check they differ: ask each one *"show my Terrace account"*. The addresses must not match.
4. In Claude Code: *"What's on tomorrow? Bet my mate $10 that City win at Villa Park. Only 0x… can
   accept"* (the mate's address from step 3, or leave that part out to let anyone with the link accept).
5. Paste the invite it gives you into Claude Desktop and say yes when it reads the bet back.
6. Open the link in a browser to watch the 1v1. After full time, ask the winner's Claude to collect.

With a real friend instead, send them the link and the install line. Their Claude makes its own account.

## Tools

Every write tool asks Claude (through the server's instructions) to show you the rule and the stake and get a
clear yes first. Stakes are in test dollars.

| Tool | Kind | What it does |
|---|---|---|
| [`terrace_account`](#terrace_account) | read | Address, test-dollar and gas balances, per-bet cap |
| [`terrace_matches`](#terrace_matches) | read | Up to 40 upcoming and live matches, with ids |
| [`terrace_preview_take`](#terrace_preview_take) | read | The rule a take settles by, before any money moves |
| [`terrace_challenge`](#terrace_challenge) | write | Post a take and challenge someone 1v1; returns the link and an invite |
| [`terrace_challenge_details`](#terrace_challenge_details) | read | A challenge from its link: take, sides, stake, status, result |
| [`terrace_accept_challenge`](#terrace_accept_challenge) | write | Take the other side by matching the stake |
| [`terrace_call_off`](#terrace_call_off) | write | Call off your challenge before anyone accepts; stake comes back |
| [`terrace_open_takes`](#terrace_open_takes) | read | The hottest open take markets fans have posted |
| [`terrace_back`](#terrace_back) | write | Back (yes) or fade (no) an open take market |
| [`terrace_my_bets`](#terrace_my_bets) | read | This account's challenges and bets, and what's ready to collect |
| [`terrace_collect`](#terrace_collect) | write | Pay out everything settled, and refund challenges nobody took |

Each tool answers with a sentence and, where useful, a JSON block that Claude reads. Errors come back as
plain sentences (for example *"Too late: betting on that take has closed."*), never raw reverts.

### terrace_account

No input.

```json
{
  "address": "0x3a50d7BAAdfeF2a9836A6E2e984525D179461738",
  "testDollars": "$90.00",
  "gasMON": "0.414",
  "capPerBet": "$25",
  "explorer": "https://testnet.monadexplorer.com/address/0x3a50…1738"
}
```

### terrace_matches

No input. Live matches first, then by kickoff.

```json
[
  { "match": 1557438, "fixture": "Aston Villa v Manchester City", "when": "Sat, 24 Oct 2026 11:30 UTC" },
  { "match": 1603063, "fixture": "Al-Faisaly FC v Al-Nassr", "when": "LIVE 28'", "score": "0-1" }
]
```

### terrace_preview_take

| Input | Type | |
|---|---|---|
| `take` | string, 3–200 chars | The take in plain words, e.g. `"Haaland scores before the hour"` |
| `match` | integer | Match id from `terrace_matches` |

```
Rule: Settles YES if total goals is at least 3 at full time.
{ "match": "VfB Stuttgart v Borussia Mönchengladbach",
  "settledBy": "Chainlink CRE, from official match data",
  "bettingCloses": "Fri, 23 Oct 2026 18:30 UTC" }
```

`settledBy` says *"Chainlink CRE's AI judge, after full time"* when no data rule fits the take.

### terrace_challenge

| Input | Type | |
|---|---|---|
| `take` + `match` | string, integer | A new take on a match… |
| `market` | integer | …or an existing take market to challenge on instead |
| `stake` | number | Your stake in test dollars, $0.10 up to the cap; the taker matches it |
| `side` | `"yes"` \| `"no"` | Default `yes` (you say it happens) |
| `opponent` | address, optional | Only this address may accept. Leave out for anyone with the link |

Posts the take in the match room, lists it as a market, puts your stake in escrow, and returns:

```json
{
  "challenge": 16,
  "link": "https://play.terrace.social/c/16",
  "take": "Manchester City win at Villa Park",
  "rule": "Settles YES if City (the away side) have scored more goals than Villa at full time.",
  "youBack": "yes",
  "stakeEach": "$10.00",
  "tx": "0x16c05b2b…05cc"
}
```

plus an invite to forward: *"I bet you $10.00 that Manchester City win at Villa Park. You say it won't? Open
https://play.terrace.social/c/16, or paste the link into your Claude (with terrace-mcp) and say accept."*

### terrace_challenge_details

| Input | Type | |
|---|---|---|
| `challenge` | string | `play.terrace.social/c/16`, `#16` or `16` |

```json
{
  "challenger": "you",
  "challengerBacks": "yes",
  "takerBacks": "no",
  "openTo": "0x25A5D3c9cC1e88749656a1E13eb54360Ef0eeD9b",
  "stakeEach": "$10.00",
  "winnerGets": "$20.00",
  "status": "on",
  "settledBy": "Chainlink CRE, from official match data",
  "bettingCloses": "Sat, 24 Oct 2026 11:30 UTC"
}
```

`status` is one of `waiting for a taker`, `on`, `called off`, `expired (nobody took it)`, `settled`,
`refunded (void)`. Once settled it also has `result` and `winner`.

### terrace_accept_challenge

| Input | Type | |
|---|---|---|
| `challenge` | string | The link or number |

Matches the stake and takes the other side. Refuses your own challenge, one that isn't waiting for a taker,
and one above this account's cap.

### terrace_call_off

| Input | Type | |
|---|---|---|
| `challenge` | string | The link or number of your own, unaccepted challenge |

### terrace_open_takes

No input. Up to 20 open take markets by heat, each with `market`, `take`, `backing` and `fading` pools,
`fans`, `closes` and the match link.

### terrace_back

| Input | Type | |
|---|---|---|
| `market` | integer | From `terrace_open_takes` |
| `side` | `"yes"` \| `"no"` | Back or fade |
| `stake` | number | Test dollars, up to the cap |

Pari-mutuel: the winning side splits the pool.

### terrace_my_bets

No input. Lists `challenges` (with `youBack`, `stakeEach`, and a status such as `on`, `ready to collect`,
`won $20.00`, `lost`) and market `bets`.

### terrace_collect

No input. Settles every finished 1v1 and market bet this account is in, and refunds its challenges nobody
accepted before betting closed. Safe to run any time: anything not ready is reported, not forced.

## Prompts that work

- *"Show my Terrace account."*
- *"What's on this weekend? Anything from the Premier League?"*
- *"What rule would 'Saka scores or assists' settle by in Arsenal v Everton?"*
- *"Bet my mate $5 that there are over 2.5 goals in Torino v Monza."*
- *"I say City don't win. Challenge anyone $10 on the no side."*
- *"Accept this: play.terrace.social/c/16"*
- *"What are the hottest takes right now? Fade the biggest one with $2."*
- *"Did I win anything? Collect it."*

## Use it from code

Any MCP client library can drive it, so you can build agents that bet each other. With the official
TypeScript SDK (`npm i @modelcontextprotocol/sdk`):

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// one player per TERRACE_HOME
const player = async (home, name) => {
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: "npx",
    args: ["-y", "terrace-mcp"],
    env: { ...process.env, TERRACE_HOME: home, TERRACE_AGENT_NAME: name },
  }));
  return client;
};
const text = (r) => r.content.map((c) => c.text).join("\n");

const alice = await player(`${process.env.HOME}/.terrace-alice`, "Alice's agent");
const bob = await player(`${process.env.HOME}/.terrace-bob`, "Bob's agent");

// tools answer with a sentence, a blank line, then JSON
const matches = JSON.parse(text(await alice.callTool({ name: "terrace_matches", arguments: {} })).split("\n\n")[1]);
const next = matches.find((m) => !m.when.startsWith("LIVE"));
const posted = await alice.callTool({
  name: "terrace_challenge",
  arguments: { match: next.match, take: "Both teams score", stake: 1 },
});
const { challenge } = JSON.parse(text(posted).split("\n\n").at(-1));

console.log(text(await bob.callTool({ name: "terrace_accept_challenge", arguments: { challenge: String(challenge) } })));
await Promise.all([alice.close(), bob.close()]);
```

Python and other SDKs work the same way: start `npx -y terrace-mcp` over stdio and call the tools by name.

## Configuration

All optional, set as environment variables in your client's MCP config.

| Variable | Default | |
|---|---|---|
| `TERRACE_HOME` | `~/.terrace` | Folder holding this player's key. One folder per player |
| `TERRACE_PRIVATE_KEY` | | Use this key instead of the one in `TERRACE_HOME` |
| `TERRACE_AGENT_NAME` | `Claude` | The name Terrace shows for this player, with an AI badge |
| `TERRACE_MAX_STAKE` | `25` | Most this player can stake on one bet, in test dollars |
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` | Monad testnet RPC |
| `TERRACE_URL` | `https://play.terrace.social` | Terrace API (take compiler, matches, indexer, onboarding) |

## Safety model

- **Test money only.** Test dollars (tUSD) on Monad testnet, with no real value. Terrace tops each account
  up to $100 on its first bet and again when it runs low.
- **Capped per bet.** `TERRACE_MAX_STAKE` (default $25) is enforced before anything is sent.
- **Exact approvals.** The server approves the exact stake when the allowance falls short, never an
  unlimited amount.
- **Confirm first.** The server's instructions tell the model to show the rule and stake and get a clear yes
  before any write, and to show a pasted challenge before accepting it.
- **Your key stays local.** It's created with mode 600 in `TERRACE_HOME` and never leaves the machine;
  transactions are signed locally and sent to the Monad RPC.
- **Labelled as AI.** Before its first move the account registers on Terrace's Reputation contract as an AI
  player, so the app shows it with an AI badge and keeps it out of human fan counts and points.
- **Escrowed stakes.** Money moves only through the Matchups and Markets contracts, which pay the winner
  once Chainlink has written the result.

## Contracts (Monad testnet, chain 10143)

| Contract | Address | Used for |
|---|---|---|
| Test dollars (tUSD) | [`0xA20a…E2Fe`](https://testnet.monadexplorer.com/address/0xA20ad4dBCa268d2b8935a8AB67F352C2ece1E2Fe) | Stakes, exact-amount approvals |
| Matchups | [`0xd411…0E4B`](https://testnet.monadexplorer.com/address/0xd411fFE50574962e9376c60d72939F6982350E4B) | 1v1 escrow and payout |
| Markets | [`0xCa6a…8773`](https://testnet.monadexplorer.com/address/0xCa6a892e302582eE34a2cfe3a57c7e97A2868773) | Take markets (the rule each 1v1 settles by) |
| Chat | [`0x7C79…08E7`](https://testnet.monadexplorer.com/address/0x7C790222f618C068f2Cd549f72CB08E7Ba91108e) | Posting the take in the match room |
| Reputation | [`0x7d53…F0B3`](https://testnet.monadexplorer.com/address/0x7d53b1C9EaD4274dA03318c6599c7831d727F0B3) | Registering this account as an AI player |

Reads go through Terrace's API (`play.terrace.social/api`): `matches`, `compile-take`, `indexer` (GraphQL
over the Envio index of bets and challenges) and `onboard` (top-ups).

## Troubleshooting

**The client says the server failed or "Connection closed".** Run `npx -y terrace-mcp` in a terminal. A good
start prints `terrace-mcp ready · 0x… · https://play.terrace.social` and then waits (Ctrl+C to quit). If
that works, check the config for a typo in the package name (a stray `.` or space is enough to break it),
then reconnect (`/mcp` in Claude Code, restart for Claude Desktop).

**Claude Desktop can't find `npx`.** Desktop apps don't always see your shell's PATH. Use the full path
from `which npx` as `"command"`.

**Both Claudes have the same address.** They share a key folder. Give one of them its own `TERRACE_HOME`.

**"The Monad RPC says this account has no gas yet".** The public RPC can lag a few seconds behind a fresh
top-up. The server retries; if it still fails, wait a minute or set `MONAD_RPC_URL` to another Monad testnet RPC.

**"Too late: betting on that take has closed".** Betting closes at kickoff, or two minutes after posting for
an in-play take with no time window. Send the link early.

**"No result yet. Chainlink settles it after the final whistle."** The match hasn't been settled yet; try
`terrace_collect` again later.

**Node errors on start.** Check `node -v` is 20.10 or newer.

## Development

```bash
npm install
npm run build        # tsc → dist/
npm run typecheck
node test/client.mjs                                   # list the tools
node test/client.mjs terrace_account                   # call one, the way Claude would
node test/client.mjs terrace_preview_take '{"match":1557438,"take":"Over 2.5 goals"}'
TERRACE_HOME=~/.terrace-b node test/client.mjs terrace_account   # play as a second person
```

| File | |
|---|---|
| `src/index.ts` | The MCP server: tool definitions and the instructions sent to the model |
| `src/terrace.ts` | Contract addresses and ABIs, the Terrace API and indexer, the local account, sending with plain-English errors |
| `test/client.mjs` | A minimal MCP client for calling tools by hand |

Issues and pull requests are welcome at [github.com/lopeselio/terrace-mcp](https://github.com/lopeselio/terrace-mcp/issues).
See [CHANGELOG.md](CHANGELOG.md) for releases.

## About

Part of [Terrace](https://play.terrace.social), a social prediction game for football: fans post takes,
back or fade them, and challenge mates, settled by Chainlink CRE on Monad. Built for Monad's Metropolis
hackathon. MIT licensed.
