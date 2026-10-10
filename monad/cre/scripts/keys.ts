/**
 * Creates the workflow keys if they're missing and prints only their public halves.
 *
 *   bun run keys
 *
 * - CRE_SECRET_SIM_ATTESTOR_PRIVATE_KEY  signs simulated reports; its address goes to the deploy script
 * - CRE_SECRET_REVEAL_PRIVATE_KEY     opens sealed picks and bets; its public key goes to the app
 *
 * Private keys are written straight into cre/.env (gitignored) and never printed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { bytesToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { revealPublicKey } from "../shared/sealed";

const envPath = join(import.meta.dir, "..", ".env");
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

const get = (name: string): Hex | undefined => {
  const m = env.match(new RegExp(`^${name}=(0x[0-9a-fA-F]{64})\\s*$`, "m"));
  return m?.[1] as Hex | undefined;
};

const ensure = (name: string): Hex => {
  const existing = get(name);
  if (existing) return existing;
  const key = bytesToHex(new Uint8Array(randomBytes(32)));
  const line = `${name}=${key}`;
  env = new RegExp(`^${name}=.*$`, "m").test(env)
    ? env.replace(new RegExp(`^${name}=.*$`, "m"), line)
    : `${env.replace(/\n?$/, "\n")}${line}\n`;
  console.log(`created ${name} in cre/.env`);
  return key;
};

const attestor = ensure("CRE_SECRET_SIM_ATTESTOR_PRIVATE_KEY");
const reveal = ensure("CRE_SECRET_REVEAL_PRIVATE_KEY");
writeFileSync(envPath, env, { mode: 0o600 });

console.log(`CRE_SIM_ATTESTOR (deploy script)        ${privateKeyToAccount(attestor).address}`);
console.log(`NEXT_PUBLIC_REVEAL_PUBLIC_KEY (app)     ${revealPublicKey(reveal)}`);
