import "server-only";
import deployment from "@deployments/10143.json";

/*
 * How many transactions have touched Terrace's contracts, for the live counter on /ops. Counted from
 * Envio HyperSync rather than the indexer: a transaction counts if it was sent to one of our contracts
 * or any of our contracts logged an event in it, so CRE reports through the forwarder count too.
 * The first call scans from the deploy block (a couple of seconds); later calls only read new blocks.
 */

const HYPERSYNC = "https://monad-testnet.hypersync.xyz/query";
const DAY = 86_400;

const v3 = (deployment as { houseRules?: { startBlock: number; contracts: Record<string, string> } }).houseRules;
const CONTRACTS: [string, string][] = [
  ...Object.entries(deployment.contracts).map(([name, a]) => [a.toLowerCase(), name] as [string, string]),
  ...Object.entries(v3?.contracts ?? {}).map(([name, a]) => [a.toLowerCase(), `${name} (house rules)`] as [string, string]),
];
const NAME = new Map(CONTRACTS);
const ADDRESSES = CONTRACTS.map(([a]) => a);

type Log = { transaction_hash: string; address: string; block_number: number };
type Tx = { hash: string; from: string; to: string | null; block_number: number };
type Block = { number: number; timestamp: string };
type Page = { data: { logs?: Log[]; transactions?: Tx[]; blocks?: Block[] }[]; next_block: number; archive_height: number };

const state = {
  next: deployment.startBlock,
  total: 0,
  times: [] as number[], // block time of every counted transaction, for the last-24h figure
  senders: new Set<string>(),
  perContract: new Map<string, number>(),
  height: 0,
};
let running: Promise<void> | null = null;
let synced = 0;
const FRESH = 10_000; // HyperSync rate-limits, so read new blocks at most this often however many tabs poll

async function page(from: number, retries = 2): Promise<Page> {
  const res = await fetch(HYPERSYNC, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.ENVIO_API_TOKEN}` },
    body: JSON.stringify({
      from_block: from,
      logs: [{ address: ADDRESSES }],
      transactions: [{ to: ADDRESSES }],
      field_selection: {
        log: ["transaction_hash", "address", "block_number"],
        transaction: ["hash", "from", "to", "block_number"],
        block: ["number", "timestamp"],
      },
    }),
    cache: "no-store",
  }).catch((e) => {
    if (retries) return null;
    throw e;
  });
  if (!res) return page(from, retries - 1); // the odd dropped connection
  if (!res.ok) throw new Error(`hypersync ${res.status}`);
  return res.json();
}

async function catchUp() {
  for (let i = 0; i < 200; i++) {
    const p = await page(state.next);
    // A page always ends on a block boundary, so a transaction never straddles two pages
    const touched = new Map<string, Set<string>>();
    const at = new Map<number, number>();
    const touch = (hash: string, addr: string | null) => {
      if (!touched.has(hash)) touched.set(hash, new Set());
      if (addr && NAME.has(addr)) touched.get(hash)!.add(addr);
    };
    for (const d of p.data) {
      for (const b of d.blocks ?? []) at.set(b.number, parseInt(b.timestamp, 16));
      for (const l of d.logs ?? []) touch(l.transaction_hash, l.address.toLowerCase());
      for (const t of d.transactions ?? []) {
        touch(t.hash, t.to?.toLowerCase() ?? null);
        state.senders.add(t.from.toLowerCase());
      }
    }
    const blockOf = new Map<string, number>();
    for (const d of p.data) for (const l of d.logs ?? []) blockOf.set(l.transaction_hash, l.block_number);
    for (const d of p.data) for (const t of d.transactions ?? []) blockOf.set(t.hash, t.block_number);
    for (const [hash, addrs] of touched) {
      state.total++;
      state.times.push(at.get(blockOf.get(hash)!) ?? 0);
      for (const a of addrs) state.perContract.set(a, (state.perContract.get(a) ?? 0) + 1);
    }
    state.next = p.next_block;
    state.height = p.archive_height;
    if (p.next_block >= p.archive_height) return;
  }
}

export type TxCount = { total: number; last24h: number; senders: number; block: number; at: number; contracts: { name: string; address: string; txs: number }[] };

export async function getTxCount(): Promise<TxCount> {
  if (!process.env.ENVIO_API_TOKEN) throw new Error("ENVIO_API_TOKEN isn't set");
  if (Date.now() - synced > FRESH) {
    running ??= catchUp()
      .then(() => void (synced = Date.now()))
      .finally(() => (running = null));
    try {
      await running;
    } catch (e) {
      if (!state.total) throw e; // nothing to show yet; otherwise keep the last count until it answers
      synced = Date.now();
    }
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    total: state.total,
    last24h: state.times.filter((t) => t >= now - DAY).length,
    senders: state.senders.size,
    block: state.height,
    at: now,
    contracts: CONTRACTS.map(([address, name]) => ({ name, address, txs: state.perContract.get(address) ?? 0 })).sort((a, b) => b.txs - a.txs),
  };
}
