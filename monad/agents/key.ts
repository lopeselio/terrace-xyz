/** Creates the house agent's key in agents/.env if missing and prints only its address (fund it with MON). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const path = new URL(".env", import.meta.url).pathname;
let env = existsSync(path) ? readFileSync(path, "utf8") : "";
let key = env.match(/^AGENT_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
if (!key) {
  key = bytesToHex(new Uint8Array(randomBytes(32)));
  env = `${env.replace(/\n?$/, "\n")}AGENT_PRIVATE_KEY=${key}\n`;
  writeFileSync(path, env, { mode: 0o600 });
  console.log("created AGENT_PRIVATE_KEY in agents/.env");
}
console.log("house agent:", privateKeyToAccount(key as `0x${string}`).address);
