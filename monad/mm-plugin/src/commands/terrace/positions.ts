import { PluginCommand } from "@metamask/agent-wallet/plugin";
import { ctxOf, dollars, gql, walletAddress } from "../../terrace.js";

type Bet = { stake: string; side: number; result: number | null; payout: string | null; market: { id: string; question: { answer: number; text: string } } };
const SIDE = ["sealed", "yes", "no"];
const ANSWER = ["open", "yes", "no", "void"];

/** `mm terrace positions`: this wallet's Terrace bets and which ones can be collected. */
export default class TerracePositions extends PluginCommand<{ wallet: string; positions: object[]; collectable: number }> {
  static description = "Show this wallet's Terrace bets: stake, side, answer, and whether the payout is ready to collect.";
  static examples = ["<%= config.bin %> terrace positions --json"];
  static requiresInit = true;
  pluginCommandId = "terrace:positions";

  async execute() {
    const wallet = walletAddress(ctxOf(this));
    const data = await gql<{ Bet: Bet[] }>(
      `query P($me: String!) { Bet(where: { bettor: { _eq: $me } }) { stake side result payout market { id question { answer text } } } }`,
      { me: wallet.toLowerCase() },
    );
    const positions = data.Bet.map((b) => ({
      market: Number(b.market.id),
      take: b.market.question.text,
      side: SIDE[b.side],
      stake: `$${dollars(b.stake)}`,
      answer: ANSWER[b.market.question.answer],
      status: b.result === null ? (b.market.question.answer === 0 ? "open" : "ready to collect") : b.result === 1 ? `won $${dollars(b.payout ?? 0)}` : b.result === 0 ? "refunded" : "lost",
    }));
    return { wallet, positions, collectable: positions.filter((p) => p.status === "ready to collect").length };
  }
}
