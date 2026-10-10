import { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { encodeFunctionData } from "viem";
import { ABI, ADDR, ctxOf, submit } from "../../terrace.js";

const inputs = {
  broadcast: { type: InputFieldType.Boolean, flag: "broadcast", message: "Hand the transaction to the wallet. Without this, print it and stop", default: false, prompt: false },
};

/** `mm terrace faucet`: claim 1,000 Terrace test dollars (once an hour). Testnet only, no value. */
export default class TerraceFaucet extends PluginCommand<object> {
  static description = "Claim 1,000 Terrace test dollars on Monad testnet (once an hour). No real value. Dry run unless --broadcast.";
  static examples = ["<%= config.bin %> terrace faucet --broadcast"];
  static requiresAuth = true;
  static requiresInit = true;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  pluginCommandId = "terrace:faucet";

  async execute(io: { resolveInputs: (s: typeof inputs) => Promise<{ broadcast?: boolean }> }) {
    const r = await io.resolveInputs(inputs);
    return submit(
      ctxOf(this),
      io,
      this.pluginCommandId,
      [{ to: ADDR.usd, data: encodeFunctionData({ abi: ABI.usd, functionName: "claim" }), summary: "Claim 1,000 Terrace test dollars" }],
      r.broadcast === true,
    );
  }
}
