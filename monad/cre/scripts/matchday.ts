/**
 * Match-day runner: drives Terrace's CRE workflows on a schedule while we settle through
 * `cre workflow simulate --broadcast` (before CRE deploy access).
 *
 *   bun run matchday            (wrapped in caffeinate so the Mac stays awake)
 *
 * Every tick it asks the oracle what needs doing and only runs a workflow when there is work:
 *   questions   every minute, when a take or question has closed and is waiting for an answer
 *   results     every 2 minutes, when a match has kicked off without a final score
 *   reveal      every 2 minutes, opening sealed bets and picks whose reveal window is open
 *   fixtures    every 6 hours, scheduling upcoming matches
 * Workflows run one at a time, so simulated reports reach the oracle in nonce order.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import { ORACLE_ABI } from "../shared/abi";

const root = join(import.meta.dir, "..");
const oracle = JSON.parse(readFileSync(join(root, "settlement/config.staging.json"), "utf8")).oracleAddress as `0x${string}`;
const alchemyKey = readFileSync(join(root, ".env"), "utf8").match(/^ALCHEMY_API_KEY=(.+)$/m)?.[1]?.trim();
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(alchemyKey ? `https://monad-testnet.g.alchemy.com/v2/${alchemyKey}` : undefined),
});

type Job = { name: string; workflow: string; trigger: number; everyMs: number; hasWork: () => Promise<boolean | string> };

const jobs: Job[] = [
  {
    name: "questions",
    workflow: "questions",
    trigger: 0,
    everyMs: 60_000,
    hasWork: async () => {
      const ids = await client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "pendingQuestions" });
      return ids.length > 0 && `${ids.length} waiting`;
    },
  },
  {
    name: "results",
    workflow: "settlement",
    trigger: 0,
    everyMs: 120_000,
    hasWork: async () => {
      const ids = await client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "pendingFixtures" });
      return ids.length > 0 && `${ids.length} under way`;
    },
  },
  { name: "reveal", workflow: "reveal", trigger: 0, everyMs: 120_000, hasWork: async () => true },
  { name: "fixtures", workflow: "settlement", trigger: 1, everyMs: 6 * 3_600_000, hasWork: async () => true },
];

const lastRun = new Map<string, number>();
// Each run compiles its workflow (~450 MB), so runs never overlap and a stuck one is killed: overlapping
// ticks once stacked compiles until the server ran out of memory and stopped settling matches.
const RUN_LIMIT_MS = 5 * 60_000;
let ticking = false;
const stamp = () => new Date().toLocaleTimeString();

function simulate(workflow: string, trigger: number): Promise<string> {
  return new Promise((resolve) => {
    const args = ["workflow", "simulate", workflow, "-T", "staging-settings", "--non-interactive", "--trigger-index", String(trigger), "--broadcast"];
    // Its own process group, so a kill takes the compile and javy children with it.
    const child = spawn("cre", args, { cwd: root, detached: true });
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, RUN_LIMIT_MS);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      const logs = out.split("\n").filter((l) => l.includes("[USER LOG]")).map((l) => l.replace(/.*\[USER LOG\]\s*/, ""));
      const result = out.match(/Workflow Simulation Result:\s*\n?\s*"?(.*?)"?\s*$/m)?.[1];
      resolve(code === 0 ? [...logs, result ? `→ ${result}` : ""].filter(Boolean).join(" | ") : `failed (exit ${code}): ${out.split("\n").filter((l) => /✗|rror/.test(l)).slice(-2).join(" ")}`);
    });
  });
}

async function tick() {
  if (ticking) return; // the last tick is still running its workflows
  ticking = true;
  try {
    await runDue();
  } finally {
    ticking = false;
  }
}

async function runDue() {
  for (const job of jobs) {
    const now = Date.now();
    if (now - (lastRun.get(job.name) ?? 0) < job.everyMs) continue;
    lastRun.set(job.name, now);
    try {
      const work = await job.hasWork();
      if (!work) continue;
      console.log(`${stamp()}  ${job.name.padEnd(9)} ${typeof work === "string" ? work : ""}`);
      console.log(`${stamp()}  ${job.name.padEnd(9)} ${await simulate(job.workflow, job.trigger)}`);
    } catch (e) {
      console.log(`${stamp()}  ${job.name.padEnd(9)} check failed: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}

console.log(`Terrace match-day runner · oracle ${oracle} · Ctrl+C to stop`);
await tick();
setInterval(tick, 15_000);
