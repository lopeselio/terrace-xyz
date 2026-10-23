import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "../../sdk.js";
import { decodeEventLog, encodeFunctionData, stringToHex, type Hex } from "viem";
import { ABI, ADDR, api, approvalIfNeeded, chainClient, ctxOf, dollars, submit, toUnits, tokenFor, walletAddress } from "../../terrace.js";

const inputs = {
  text: { type: InputFieldType.Text, flag: "text", message: "Your take, in plain words (e.g. \"Haaland scores before the hour\")", required: true, prompt: false, index: 0 },
  match: { type: InputFieldType.Text, flag: "match", message: "Match id, from `mm terrace matches`", required: true, prompt: false },
  amount: { type: InputFieldType.Text, flag: "amount", message: "Your opening stake on it, in dollars", required: true, prompt: false },
  token: { type: InputFieldType.Text, flag: "token", message: "usd (test dollars, default) or usdc", required: false, prompt: false },
  broadcast: { type: InputFieldType.Boolean, flag: "broadcast", message: "Hand the transactions to the wallet. Without this, show the rule and plan and stop", default: false, prompt: false },
};
type In = { text: string; match: string; amount: string; token?: string; broadcast?: boolean };

/**
 * `mm terrace take`: post a take in a match room and list it as a market you back.
 * Terrace's take compiler turns the text into a settlement rule; the reading it returns is what
 * Chainlink CRE will check, so the dry run shows it before anything is sent.
 */
export default class TerraceTake extends PluginCommand<object> {
  static description = "Post a take to a match room and turn it into a market you back. Shows the settlement rule (checked by Chainlink) first; sends only with --broadcast.";
  static examples = [
    '<%= config.bin %> terrace take "Haaland scores before the hour" --match 1557424 --amount 5',
    '<%= config.bin %> terrace take "2+ red cards" --match 1557424 --amount 2 --broadcast --json',
  ];
  static requiresAuth = true;
  static requiresInit = true;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:take";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<In> }) {
    const r = await io.resolveInputs(inputs);
    const ctx = ctxOf(this);
    const fixtureId = Number(r.match);
    const compiled = await api<{ spec: string; reading: string; closeTime: number; error?: string }>("/api/compile-take", { text: r.text, fixtureId });
    if (compiled.error) throw new Error(compiled.error);
    const owner = walletAddress(ctx);
    const token = tokenFor(r.token ?? "usd");
    const stake = toUnits(Number(r.amount));
    const preview = { reading: compiled.reading, settlement: compiled.spec ? "Chainlink, from live match data" : "Chainlink AI judge, after full time", closes: new Date(compiled.closeTime * 1000).toISOString() };

    // 1. Post the take to the match room (its message id becomes the market's chat link).
    const post = { to: ADDR.chat, data: encodeFunctionData({ abi: ABI.chat, functionName: "post", args: [0, BigInt(fixtureId), r.text, 0n] }), summary: `Post the take "${r.text}" in the match room` };
    if (r.broadcast !== true) {
      return { ...preview, ...(await submit(ctx, io, this.pluginCommandId, [post, { to: ADDR.markets, data: "0x" as Hex, summary: `List it as a market and back it with $${dollars(stake)}` }], false)) };
    }
    const posted = await submit(ctx, io, this.pluginCommandId, [post], true);
    const hash = (posted as { sent: { txHash?: string }[] }).sent[0]?.txHash as Hex | undefined;
    if (!hash) throw new Error("Posted, but the wallet didn't return a transaction hash to find the message id.");
    const receipt = await chainClient(ctx).waitForTransactionReceipt({ hash });
    let messageId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: ABI.chat, data: log.data, topics: log.topics });
        if (ev.eventName === "MessagePosted") messageId = ev.args.messageId;
      } catch {}
    }
    if (messageId === undefined) throw new Error("Posted, but couldn't read the message id.");

    // 2. Approve the exact stake if needed, then list the take and back it.
    const list = {
      to: ADDR.markets,
      data: encodeFunctionData({
        abi: ABI.markets,
        functionName: "createTakeMarket",
        args: [messageId, BigInt(fixtureId), BigInt(compiled.closeTime), r.text, compiled.spec ? stringToHex(compiled.spec) : "0x", token, 300, 1, stake],
      }),
      summary: `List "${r.text}" as a Terrace market and back it with $${dollars(stake)}`,
    };
    const listed = await submit(ctx, io, this.pluginCommandId, [...(await approvalIfNeeded(ctx, owner, token, ADDR.markets, stake)), list], true);
    return { ...preview, messageId: Number(messageId), posted, listed };
  }
}
