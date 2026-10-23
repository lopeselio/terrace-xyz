// Runs each command against the live Terrace API and Monad testnet with a stand-in wallet host.
// Write commands run as dry runs (no --broadcast), so nothing is signed or sent.
const fan = "0x0f8ebe0c9eb286097abb94962da390e83273eb20";
const ctx = { walletStateManager: { read: () => ({ byokWallets: [{ id: "w1", address: fan }], selectedWallet: { ref: { id: "w1" } } }) } };
const io = (values) => ({ resolveInputs: async () => values });

async function run(name, values) {
  const { default: Cmd } = await import(`../dist/commands/terrace/${name}.js`);
  const cmd = Object.create(Cmd.prototype);
  cmd.ctx = ctx;
  cmd.pluginCommandId = `terrace:${name}`;
  const out = await Cmd.prototype.execute.call(cmd, io(values));
  console.log(`\n# mm terrace ${name}`);
  console.log(JSON.stringify(out, (_, v) => (typeof v === "string" && v.startsWith("0x") && v.length > 80 ? v.slice(0, 18) + "…" : v), 2).slice(0, 900));
  return out;
}

// Bet on whatever is open right now, so the test never points at a finished match.
const { matches } = await run("matches", {});
const { takes } = await run("takes", {});
const upcoming = matches.find((m) => !m.state.startsWith("LIVE"));
if (!takes.length || !upcoming) throw new Error("No open take or upcoming match to test against.");
await run("value", { min: "1.2", stake: "5" });
await run("positions", {});
await run("back", { market: String(takes[0].market), side: "no", amount: "5" });
await run("take", { text: "There will be at least 2 red cards", match: String(upcoming.match), amount: "2" });
await run("collect", {});
await run("register", { name: "The Gaffer", style: "Fades the crowd at long odds" });
