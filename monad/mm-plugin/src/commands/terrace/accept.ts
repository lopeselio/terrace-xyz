import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "../../sdk.js";
import { encodeFunctionData } from "viem";
import { ABI, ADDR, approvalIfNeeded, chainClient, ctxOf, dollars, submit, walletAddress } from "../../terrace.js";

const inputs = {
  challenge: { type: InputFieldType.Text, flag: "challenge", message: "Challenge id (the number in a play.terrace.social/c/<id> link)", required: true, prompt: false, index: 0 },
  broadcast: { type: InputFieldType.Boolean, flag: "broadcast", message: "Hand the transactions to the wallet. Without this, print them and stop", default: false, prompt: false },
};

/** `mm terrace accept`: take the other side of a 1v1 challenge by matching its stake. */
export default class TerraceAccept extends PluginCommand<object> {
  static description = "Accept a 1v1 challenge (take the other side by matching the stake). Dry run unless --broadcast.";
  static examples = ["<%= config.bin %> terrace accept 3", "<%= config.bin %> terrace accept 3 --broadcast"];
  static requiresAuth = true;
  static requiresInit = true;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:accept";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<{ challenge: string; broadcast?: boolean }> }) {
    const r = await io.resolveInputs(inputs);
    const ctx = ctxOf(this);
    const id = BigInt(r.challenge);
    const m = await chainClient(ctx).readContract({ address: ADDR.matchups, abi: ABI.matchups, functionName: "getMatchup", args: [id] });
    if (m.status !== 0) throw new Error("That challenge is no longer waiting for a taker.");
    const owner = walletAddress(ctx);
    const txs = [
      ...(await approvalIfNeeded(ctx, owner, m.token, ADDR.matchups, m.stake)),
      { to: ADDR.matchups, data: encodeFunctionData({ abi: ABI.matchups, functionName: "accept", args: [id] }), summary: `Accept Terrace 1v1 #${id} for $${dollars(m.stake)} (winner takes $${dollars(m.stake * 2n)})` },
    ];
    return submit(ctx, io, this.pluginCommandId, txs, r.broadcast === true);
  }
}
