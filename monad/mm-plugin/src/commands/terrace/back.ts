import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "../../sdk.js";
import { encodeFunctionData, type Address } from "viem";
import { ABI, ADDR, approvalIfNeeded, ctxOf, dollars, gql, submit, toUnits, walletAddress } from "../../terrace.js";

const inputs = {
  market: { type: InputFieldType.Text, flag: "market", message: "Market id, from `mm terrace takes` or `mm terrace value`", required: true, prompt: false, index: 0 },
  side: { type: InputFieldType.Text, flag: "side", message: "yes to back the take, no to fade it", required: true, prompt: false },
  amount: { type: InputFieldType.Text, flag: "amount", message: "Stake in dollars (minimum 0.10)", required: true, prompt: false },
  broadcast: { type: InputFieldType.Boolean, flag: "broadcast", message: "Hand the transactions to the wallet. Without this, print them and stop", default: false, prompt: false },
};
type In = { market: string; side: string; amount: string; broadcast?: boolean };

/** `mm terrace back`: back (yes) or fade (no) a fan's take market. */
export default class TerraceBack extends PluginCommand<object> {
  static description = "Back (yes) or fade (no) a take market. Approves the exact stake if needed, then places the bet through the wallet. Dry run unless --broadcast.";
  static examples = ["<%= config.bin %> terrace back 0 --side no --amount 5", "<%= config.bin %> terrace back 0 --side no --amount 5 --broadcast --json"];
  static requiresAuth = true;
  static requiresInit = true;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:back";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<In> }) {
    const r = await io.resolveInputs(inputs);
    const ctx = ctxOf(this);
    const side = r.side.toLowerCase() === "yes" ? 1 : r.side.toLowerCase() === "no" ? 2 : 0;
    if (!side) throw new Error("--side must be yes or no");
    const stake = toUnits(Number(r.amount));
    const { Market_by_pk: m } = await gql<{ Market_by_pk: { token: string; question: { text: string; answer: number; closeTime: string } } | null }>(
      `query M($id: String!) { Market_by_pk(id: $id) { token question { text answer closeTime } } }`,
      { id: r.market },
    );
    if (!m) throw new Error(`No market ${r.market}`);
    if (m.question.answer !== 0 || Number(m.question.closeTime) * 1000 <= Date.now()) throw new Error("That market has closed.");
    const owner = walletAddress(ctx);
    const token = m.token as Address;
    const txs = [
      ...(await approvalIfNeeded(ctx, owner, token, ADDR.markets, stake)),
      {
        to: ADDR.markets,
        data: encodeFunctionData({ abi: ABI.markets, functionName: "placeBet", args: [BigInt(r.market), side, stake] }),
        summary: `${side === 1 ? "Back" : "Fade"} "${m.question.text}" with $${dollars(stake)} on Terrace`,
      },
    ];
    return submit(ctx, io, this.pluginCommandId, txs, r.broadcast === true);
  }
}
