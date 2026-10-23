import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "../../sdk.js";
import { encodeFunctionData } from "viem";
import { ABI, ADDR, ctxOf, dollars, gql, submit, walletAddress } from "../../terrace.js";

const inputs = {
  broadcast: { type: InputFieldType.Boolean, flag: "broadcast", message: "Hand the transactions to the wallet. Without this, print them and stop", default: false, prompt: false },
};

/** `mm terrace collect`: auto-redeem. Settles every finished bet of this wallet (winnings, refunds, recorded losses). */
export default class TerraceCollect extends PluginCommand<object> {
  static description = "Collect every finished Terrace bet for this wallet: winnings and refunds are paid, losses go on the record. Dry run unless --broadcast.";
  static examples = ["<%= config.bin %> terrace collect", "<%= config.bin %> terrace collect --broadcast --json"];
  static requiresAuth = true;
  static requiresInit = true;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:collect";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<{ broadcast?: boolean }> }) {
    const r = await io.resolveInputs(inputs);
    const ctx = ctxOf(this);
    const me = walletAddress(ctx);
    const { Bet } = await gql<{ Bet: { stake: string; market: { id: string; question: { answer: number; text: string } } }[] }>(
      `query C($me: String!) { Bet(where: { bettor: { _eq: $me }, result: { _is_null: true } }) { stake market { id question { answer text } } } }`,
      { me: me.toLowerCase() },
    );
    const ready = Bet.filter((b) => b.market.question.answer !== 0);
    if (ready.length === 0) return { broadcast: r.broadcast === true, note: "Nothing to collect yet." };
    const txs = ready.map((b) => ({
      to: ADDR.markets,
      data: encodeFunctionData({ abi: ABI.markets, functionName: "settleBet", args: [BigInt(b.market.id), me] }),
      summary: `Collect "${b.market.question.text}" ($${dollars(b.stake)} staked) on Terrace`,
    }));
    return submit(ctx, io, this.pluginCommandId, txs, r.broadcast === true);
  }
}
