/**
 * End-to-end test of sealed bets on Monad testnet, through the real CRE reveal workflow.
 *
 *   bun run e2e:sealed
 *
 * 1. Creates a question that closes in ~90 seconds and a sealed market on it.
 * 2. Places a sealed bet: only a commitment and a ciphertext for the CRE reveal key go on-chain,
 *    so nobody can see the side.
 * 3. Waits for close, then runs `cre workflow simulate reveal --broadcast` (handlerInTee).
 * 4. Checks the contract accepted the reveal: the side is recovered and the commitment matched.
 *
 * Uses the CRE broadcaster key from cre/.env as the bettor (claims test dollars if needed).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { revealPublicKey, seal } from "../shared/sealed";

const root = join(import.meta.dir, "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2].trim()]),
) as Record<string, string>;
const deployment = JSON.parse(readFileSync(join(root, "../deployments/10143.json"), "utf8"));
const C = deployment.contracts as Record<string, Address>;

const abi = parseAbi([
  "function customQuestion(uint256 fixtureId, uint64 closeTime, string text, bytes spec) returns (uint256)",
  "event QuestionCreated(uint256 indexed questionId, uint256 indexed fixtureId, uint8 kind, uint8 line, uint64 closeTime, address creator, string text)",
  "function createMarket(uint256 questionId, address token, uint16 feeBps, bool sealed_, bool flash) returns (uint256)",
  "event MarketCreated(uint256 indexed marketId, uint256 indexed questionId, address indexed creator, address token, uint16 feeBps, bool sealed_, bool flash)",
  "function placeSealedBet(uint256 marketId, uint256 stake, bytes32 commitment, bytes ciphertext)",
  "function positionOf(uint256 marketId, address bettor) view returns ((uint8 side, bool settled, bool invalid, uint128 stake, bytes32 commitment))",
  "function getMarket(uint256 marketId) view returns ((uint256 questionId, address token, address creator, uint16 feeBps, bool sealed_, bool flash, uint128 yesPool, uint128 noPool, uint128 sealedPool, uint32 unrevealed))",
  "function claim()",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const account = privateKeyToAccount(env.CRE_ETH_PRIVATE_KEY as Hex);
const transport = http(env.ALCHEMY_API_KEY ? `https://monad-testnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : undefined);
const reader = createPublicClient({ chain: monadTestnet, transport });
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
const step = (msg: string) => console.log(`\n▸ ${msg}`);

async function write(to: Address, functionName: string, args: unknown[] = []) {
  const { request } = await reader.simulateContract({ account, address: to, abi, functionName: functionName as never, args: args as never });
  const hash = await wallet.writeContract(request as never);
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return receipt;
}
function eventArg<T>(receipt: { logs: { data: Hex; topics: [Hex, ...Hex[]] | [] }[] }, name: string, key: string): T {
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === name) return (ev.args as Record<string, T>)[key];
    } catch {}
  }
  throw new Error(`no ${name} event`);
}

const stake = 1_000_000n; // $1
const close = BigInt(Math.floor(Date.now() / 1000) + 90);

step(`bettor ${account.address}`);
if ((await reader.readContract({ address: C.TerraceUSD, abi, functionName: "balanceOf", args: [account.address] })) < stake) {
  await write(C.TerraceUSD, "claim");
  console.log("  claimed test dollars");
}
await write(C.TerraceUSD, "approve", [C.TerraceMarkets, stake]);

step("create a question closing in 90s and a sealed market on it");
const q = await write(C.TerraceOracle, "customQuestion", [0n, close, `E2E sealed reveal check ${new Date().toISOString()}`, "0x"]);
const questionId = eventArg<bigint>(q, "QuestionCreated", "questionId");
const m = await write(C.TerraceMarkets, "createMarket", [questionId, C.TerraceUSD, 0, true, false]);
const marketId = eventArg<bigint>(m, "MarketCreated", "marketId");
console.log(`  question ${questionId}, market ${marketId}`);

step("place a sealed YES bet: only a commitment and ciphertext go on-chain");
const side = 1;
const salt = bytesToHex(new Uint8Array(randomBytes(32)));
const commitment = keccak256(
  encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }], [marketId, account.address, side, salt]),
);
const revealPub = revealPublicKey(env.CRE_SECRET_REVEAL_PRIVATE_KEY as Hex);
const ciphertext = seal(revealPub, { v: 1, side, salt }, (n) => new Uint8Array(randomBytes(n)));
await write(C.TerraceMarkets, "placeSealedBet", [marketId, stake, commitment, ciphertext]);
let pos = await reader.readContract({ address: C.TerraceMarkets, abi, functionName: "positionOf", args: [marketId, account.address] });
console.log(`  on-chain side before reveal: ${pos.side} (0 = hidden) · ciphertext ${ciphertext.length / 2 - 1} bytes`);

step("wait for the market to close");
while (BigInt(Math.floor(Date.now() / 1000)) <= close + 3n) await Bun.sleep(3000);

step("run the CRE reveal workflow (TEE) with --broadcast");
const run = spawnSync("cre", ["workflow", "simulate", "reveal", "-T", "staging-settings", "--non-interactive", "--trigger-index", "0", "--broadcast"], { cwd: root, encoding: "utf8" });
const logs = `${run.stdout}${run.stderr}`.split("\n").filter((l) => /USER LOG|Result|✗|rror/.test(l));
console.log(logs.map((l) => `  ${l.trim()}`).join("\n"));

step("check the reveal on-chain");
await Bun.sleep(2000);
pos = await reader.readContract({ address: C.TerraceMarkets, abi, functionName: "positionOf", args: [marketId, account.address] });
const market = await reader.readContract({ address: C.TerraceMarkets, abi, functionName: "getMarket", args: [marketId] });
const ok = pos.side === side && !pos.invalid && market.unrevealed === 0 && market.yesPool === stake;
console.log(`  side ${pos.side}, invalid ${pos.invalid}, unrevealed ${market.unrevealed}, yes pool ${market.yesPool}`);
console.log(ok ? "\n✓ sealed bet revealed by CRE and verified against its commitment" : "\n✗ reveal did not land as expected");
process.exit(ok ? 0 : 1);
