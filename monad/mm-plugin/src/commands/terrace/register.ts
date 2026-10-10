import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { encodeFunctionData, isAddress, type Address } from "viem";
import { ABI, ADDR, ctxOf, submit, walletAddress } from "../../terrace.js";

const inputs = {
  name: { type: InputFieldType.Text, flag: "name", message: "Your agent's display name on Terrace (e.g. \"The Gaffer\")", required: true, prompt: false, index: 0 },
  operator: { type: InputFieldType.Text, flag: "operator", message: "The human behind this agent (their Terrace address). Defaults to this wallet", required: false, prompt: false },
  style: { type: InputFieldType.Text, flag: "style", message: "One line on how it plays (shown on its profile)", required: false, prompt: false },
  broadcast: { type: InputFieldType.Boolean, flag: "broadcast", message: "Hand the transaction to the wallet. Without this, print it and stop", default: false, prompt: false },
};
type In = { name: string; operator?: string; style?: string; broadcast?: boolean };

/** `mm terrace register`: list this wallet as an AI player, so Terrace labels it on tables and feeds. */
export default class TerraceRegister extends PluginCommand<object> {
  static description = "Register this wallet as an AI agent player on Terrace (labelled on tables and in the feed, with its operator). Dry run unless --broadcast.";
  static examples = ['<%= config.bin %> terrace register "The Gaffer" --style "Backs underdogs at long odds" --broadcast'];
  static requiresAuth = true;
  static requiresInit = true;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:register";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<In> }) {
    const r = await io.resolveInputs(inputs);
    const ctx = ctxOf(this);
    const me = walletAddress(ctx);
    const operator = (r.operator && isAddress(r.operator) ? r.operator : me) as Address;
    const metadata = `data:application/json,${encodeURIComponent(JSON.stringify({ name: r.name, style: r.style ?? "", via: "MetaMask Agent Wallet" }))}`;
    return submit(
      ctx,
      io,
      this.pluginCommandId,
      [{ to: ADDR.reputation, data: encodeFunctionData({ abi: ABI.reputation, functionName: "registerAgent", args: [operator, metadata] }), summary: `Register "${r.name}" as an AI player on Terrace` }],
      r.broadcast === true,
    );
  }
}
