/**
 * Terrace reveal workflow (Chainlink CRE confidential compute)
 *
 * Sealed bets and sealed picks sit onchain as commitments plus ciphertexts encrypted to the
 * reveal key. This workflow is the only thing that holds that key:
 *
 *   Markets  After a sealed market closes, open every sealed bet and report (bettor, side, salt).
 *   Picks    When a sealed contest opens for reveal (at kickoff, or once the whole gameweek is
 *            played for private leagues), open every entry and report the picks.
 *
 * The contracts check each reveal against its commitment, so the workflow can't change
 * anyone's pick; at worst a bad reveal refunds the bet or zeroes the entry.
 *
 * With `useTee: true` the handler runs inside a TEE (handlerInTee): the reveal key and the
 * decryption never leave the enclave, and chain reads and report signing are routed to the
 * DON. With `useTee: false` it runs as a normal DON handler and the key is a DON secret.
 *
 *   cre workflow simulate reveal --target staging-settings --broadcast
 */
import { cre, handlerInTee, Runner, type Runtime, type TeeRuntime } from "@chainlink/cre-sdk";
import { encodeAbiParameters, zeroHash, type Address, type Hex } from "viem";
import { z } from "zod";
import { LEAGUES_ABI, MARKETS_ABI, REPORT } from "../shared/abi";
import { evmClient, nowSeconds, read, writeReport } from "../shared/chain";
import { open, type SealedBet, type SealedPicks } from "../shared/sealed";

const configSchema = z.object({
  schedule: z.string(),
  useTee: z.boolean(),
  marketsAddress: z.string(),
  leaguesAddress: z.string(),
  scanWindow: z.number(), // how many of the newest markets / contests to look at each run
  maxReportsPerRun: z.number(),
  chainSelectorName: z.string(),
  chainId: z.number(),
  oracleAddress: z.string(),
  gasLimit: z.string(),
  simulation: z.boolean(),
});
type Config = z.infer<typeof configSchema>;

const MARKET_REVEAL_WINDOW = 86_400n; // TerraceMarkets.REVEAL_WINDOW

type Secrets = { revealKey: Hex; attestorKey?: Hex };

function revealMarkets(dons: Runtime<Config>, secrets: Secrets, budget: { left: number }) {
  const cfg = dons.config;
  const evm = evmClient(cfg);
  const now = nowSeconds(dons as Runtime<unknown>);
  const count = read(dons as Runtime<unknown>, evm, cfg.marketsAddress, MARKETS_ABI, "marketCount");
  const first = count > BigInt(cfg.scanWindow) ? count - BigInt(cfg.scanWindow) : 0n;

  for (let id = count - 1n; id >= first && budget.left > 0; id--) {
    const close = read(dons as Runtime<unknown>, evm, cfg.marketsAddress, MARKETS_ABI, "closeTimeOf", [id]);
    if (close > now || now > close + MARKET_REVEAL_WINDOW) continue;
    const bettors = read(dons as Runtime<unknown>, evm, cfg.marketsAddress, MARKETS_ABI, "unrevealedBettors", [id]);
    if (bettors.length === 0) continue;

    const sides: number[] = [];
    const salts: Hex[] = [];
    for (const bettor of bettors) {
      const sealed = read(dons as Runtime<unknown>, evm, cfg.marketsAddress, MARKETS_ABI, "sealedCiphertext", [id, bettor]);
      const bet = open<SealedBet>(secrets.revealKey, sealed);
      const valid = bet && (bet.side === 1 || bet.side === 2) && /^0x[0-9a-fA-F]{64}$/.test(bet.salt);
      sides.push(valid ? bet!.side : 0); // 0 = couldn't open: the contract refunds it
      salts.push(valid ? bet!.salt : zeroHash);
    }
    const payload = encodeAbiParameters(
      [{ type: "uint256" }, { type: "address[]" }, { type: "uint8[]" }, { type: "bytes32[]" }],
      [id, bettors as Address[], sides, salts],
    );
    const status = writeReport(dons as Runtime<unknown>, cfg, REPORT.REVEAL_BETS, payload, secrets.attestorKey);
    dons.log(`market ${id}: revealed ${bettors.length} sealed bet(s); tx ${status}`);
    budget.left--;
  }
}

function revealPicks(dons: Runtime<Config>, secrets: Secrets, budget: { left: number }) {
  const cfg = dons.config;
  const evm = evmClient(cfg);
  const now = nowSeconds(dons as Runtime<unknown>);
  const count = read(dons as Runtime<unknown>, evm, cfg.leaguesAddress, LEAGUES_ABI, "contestCount");
  const first = count > BigInt(cfg.scanWindow) ? count - BigInt(cfg.scanWindow) : 0n;

  for (let id = count - 1n; id >= first && budget.left > 0; id--) {
    if (!read(dons as Runtime<unknown>, evm, cfg.leaguesAddress, LEAGUES_ABI, "revealOpen", [id])) continue;
    if (now > read(dons as Runtime<unknown>, evm, cfg.leaguesAddress, LEAGUES_ABI, "revealDeadline", [id])) continue;
    const players = read(dons as Runtime<unknown>, evm, cfg.leaguesAddress, LEAGUES_ABI, "unrevealedPlayers", [id]);
    if (players.length === 0) continue;

    const home: number[][] = [];
    const away: number[][] = [];
    const salts: Hex[] = [];
    for (const player of players) {
      const sealed = read(dons as Runtime<unknown>, evm, cfg.leaguesAddress, LEAGUES_ABI, "sealedPicks", [id, player]);
      const picks = open<SealedPicks>(secrets.revealKey, sealed);
      const valid =
        picks &&
        Array.isArray(picks.home) &&
        Array.isArray(picks.away) &&
        picks.home.every((g) => Number.isInteger(g) && g >= 0 && g < 256) &&
        picks.away.every((g) => Number.isInteger(g) && g >= 0 && g < 256) &&
        /^0x[0-9a-fA-F]{64}$/.test(picks.salt);
      // Empty picks = couldn't open: the contract scores that entry as zero.
      home.push(valid ? picks!.home : []);
      away.push(valid ? picks!.away : []);
      salts.push(valid ? picks!.salt : zeroHash);
    }
    const payload = encodeAbiParameters(
      [{ type: "uint256" }, { type: "address[]" }, { type: "uint8[][]" }, { type: "uint8[][]" }, { type: "bytes32[]" }],
      [id, players as Address[], home, away, salts],
    );
    const status = writeReport(dons as Runtime<unknown>, cfg, REPORT.REVEAL_PICKS, payload, secrets.attestorKey);
    dons.log(`contest ${id}: revealed ${players.length} sealed entr(ies); tx ${status}`);
    budget.left--;
  }
}

function run(dons: Runtime<Config>, secrets: Secrets): string {
  const budget = { left: dons.config.maxReportsPerRun };
  revealMarkets(dons, secrets, budget);
  revealPicks(dons, secrets, budget);
  return `${dons.config.maxReportsPerRun - budget.left} reveal report(s)`;
}

/** Confidential path: decryption happens inside the enclave. */
const onCronInTee = (runtime: TeeRuntime<Config>): string => {
  const secrets: Secrets = {
    revealKey: runtime.getSecret({ id: "REVEAL_PRIVATE_KEY" }).result().value as Hex,
    attestorKey: runtime.config.simulation
      ? (runtime.getSecret({ id: "CRE_SIM_ATTESTOR_PRIVATE_KEY" }).result().value as Hex)
      : undefined,
  };
  return run(runtime.usingTheDons(), secrets);
};

/** Fallback path: same logic as a normal DON handler, with the reveal key as a DON secret. */
const onCron = (runtime: Runtime<Config>): string => {
  const secrets: Secrets = {
    revealKey: runtime.getSecret({ id: "REVEAL_PRIVATE_KEY" }).result().value as Hex,
    attestorKey: runtime.config.simulation
      ? (runtime.getSecret({ id: "CRE_SIM_ATTESTOR_PRIVATE_KEY" }).result().value as Hex)
      : undefined,
  };
  return run(runtime, secrets);
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  const trigger = cron.trigger({ schedule: config.schedule });
  return [config.useTee ? handlerInTee(trigger, onCronInTee, [{ tee: "nitro" }]) : cre.handler(trigger, onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
