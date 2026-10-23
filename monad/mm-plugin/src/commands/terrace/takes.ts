import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "../../sdk.js";
import { dollars, gql, OPEN_TAKES, payoutMultiple, type TakeMarket } from "../../terrace.js";

const inputs = {
  match: { type: InputFieldType.Text, flag: "match", message: "Only takes from this match's room (match id from `mm terrace matches`)", required: false, prompt: false },
};

/** `mm terrace takes`: fans' takes that are live markets, with pools and what each side pays. */
export default class TerraceTakes extends PluginCommand<{ takes: object[] }> {
  static description = "List open take markets: what fans said, how the pool is split, and what backing or fading pays per dollar.";
  static examples = ["<%= config.bin %> terrace takes", "<%= config.bin %> terrace takes --match 1557424 --json"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:takes";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<{ match?: string }> }) {
    const { match } = await io.resolveInputs(inputs);
    const data = await gql<{ Message: (TakeMarket & { room_id: string })[] }>(OPEN_TAKES);
    const now = Date.now() / 1000;
    const takes = data.Message.filter((m) => m.market.question.answer === 0 && Number(m.market.question.closeTime) > now)
      .filter((m) => !match || m.room_id === `match-${match}`)
      .map((m) => {
        const yes = Number(m.market.yesPool);
        const no = Number(m.market.noPool);
        return {
          market: Number(m.market.id),
          take: m.text,
          pool: `$${dollars(yes + no)} (${yes + no ? Math.round((yes / (yes + no)) * 100) : 50}% back)`,
          backPays: `${payoutMultiple(yes, no, 1).toFixed(2)}x`,
          fadePays: `${payoutMultiple(yes, no, 2).toFixed(2)}x`,
          settles: m.market.question.spec ? "Chainlink, from live match data" : "Chainlink AI judge, after full time",
          closes: new Date(Number(m.market.question.closeTime) * 1000).toISOString(),
        };
      });
    return { takes };
  }
}
