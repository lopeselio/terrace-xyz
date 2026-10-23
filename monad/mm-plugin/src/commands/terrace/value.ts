import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "../../sdk.js";
import { dollars, gql, OPEN_TAKES, payoutMultiple, type TakeMarket } from "../../terrace.js";

const inputs = {
  min: { type: InputFieldType.Text, flag: "min-multiple", message: "Only show sides paying at least this multiple per dollar (default 2.5)", required: false, prompt: false },
  stake: { type: InputFieldType.Text, flag: "stake", message: "Dollars you'd stake, used to price your own effect on the pool (default 5)", required: false, prompt: false },
};

/**
 * `mm terrace value`: the contrarian scanner. In a pari-mutuel pool the crowded side pays little and the
 * lonely side pays a lot; this finds sides whose payout (after your own stake moves the pool) clears a bar.
 */
export default class TerraceValue extends PluginCommand<{ picks: object[] }> {
  static description = "Find lopsided take markets where the less popular side pays big, priced after your own stake. Prints the exact `mm terrace back` command for each.";
  static examples = ["<%= config.bin %> terrace value", "<%= config.bin %> terrace value --min-multiple 3 --stake 10 --json"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:value";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<{ min?: string; stake?: string }> }) {
    const r = await io.resolveInputs(inputs);
    const min = Number(r.min ?? 2.5);
    const stake = Number(r.stake ?? 5);
    const data = await gql<{ Message: TakeMarket[] }>(OPEN_TAKES);
    const now = Date.now() / 1000;
    const picks = data.Message.filter((m) => m.market.question.answer === 0 && Number(m.market.question.closeTime) > now).flatMap((m) => {
      const yes = Number(m.market.yesPool);
      const no = Number(m.market.noPool);
      return ([1, 2] as const)
        .map((side) => ({ side, multiple: payoutMultiple(yes, no, side, stake * 1e6) }))
        .filter((s) => s.multiple >= min)
        .map((s) => ({
          market: Number(m.market.id),
          take: m.text,
          side: s.side === 1 ? "yes" : "no",
          pays: `${s.multiple.toFixed(2)}x`,
          pool: `$${dollars(yes + no)}`,
          run: `mm terrace back ${m.market.id} --side ${s.side === 1 ? "yes" : "no"} --amount ${stake} --broadcast`,
        }));
    });
    return { picks: picks.sort((a, b) => parseFloat(b.pays) - parseFloat(a.pays)) };
  }
}
