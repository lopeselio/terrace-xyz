import { useState, useEffect, useRef, useCallback } from "react";
import { truncatePubkey, type BadgeTier } from "./useLeaderboard";

const HELIUS_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? "";
const TERRACE_PROGRAM_ID = process.env.EXPO_PUBLIC_TERRACE_PROGRAM_ID ?? "";

export type LiveEventType =
  | "BET_PLACED"
  | "PARLAY_WON"
  | "PARLAY_LOST"
  | "MARKET_CREATED"
  | "MARKET_SETTLED"
  | "MATCHUP_CREATED"
  | "MATCHUP_SETTLED";

export interface LiveEvent {
  id: string;
  type: LiveEventType;
  actorPubkey: string;
  actorDisplay: string;
  badge: BadgeTier;
  market?: string;
  outcome?: string;
  amountUsdc?: number;
  profitUsdc?: number;
  legs?: string[];
  signature: string;
  timestamp: Date;
}

// Anchor event discriminators: sha256("event:<EventName>")[0..8]
const DISC_BET_PLACED       = new Uint8Array([88,  88,  145, 226, 126, 206, 32,  0  ]);
const DISC_MARKET_CREATED   = new Uint8Array([88,  184, 130, 231, 226, 84,  6,   58 ]);
const DISC_MARKET_SETTLED   = new Uint8Array([237, 212, 22,  175, 201, 117, 215, 99 ]);
const DISC_PARLAY_SETTLED   = new Uint8Array([143, 27,  37,  15,  205, 154, 47,  216]);
const DISC_MATCHUP_CREATED  = new Uint8Array([71,  18,  182, 244, 233, 167, 83,  100]);
const DISC_MATCHUP_SETTLED  = new Uint8Array([176, 18,  180, 132, 254, 148, 85,  79 ]);

function discMatch(data: Uint8Array, disc: Uint8Array): boolean {
  for (let i = 0; i < 8; i++) if (data[i] !== disc[i]) return false;
  return true;
}

function parsePubkey(bytes: Uint8Array, offset: number): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (let i = 0; i < 32; i++) n = (n << 8n) | BigInt(bytes[offset + i]);
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (let i = 0; i < 32; i++) { if (bytes[offset + i] !== 0) break; s = "1" + s; }
  return s;
}

function parseU64LE(bytes: Uint8Array, offset: number): number {
  let v = 0;
  for (let i = 0; i < 8; i++) v += bytes[offset + i] * Math.pow(256, i);
  return v;
}

function tryParseEvent(bytes: Uint8Array, sig: string): LiveEvent | null {
  if (bytes.length < 8) return null;
  const id = `${sig}-${Date.now()}`;
  const now = new Date();

  if (discMatch(bytes, DISC_BET_PLACED) && bytes.length >= 8 + 32 + 32 + 1 + 8) {
    const market = parsePubkey(bytes, 8);
    const bettor = parsePubkey(bytes, 40);
    const outcome = bytes[72] === 1 ? "Yes" : "No";
    const amount = parseU64LE(bytes, 73) / 1_000_000;
    return {
      id, type: "BET_PLACED", actorPubkey: bettor,
      actorDisplay: truncatePubkey(bettor), badge: "Casual",
      market, outcome, amountUsdc: amount, signature: sig, timestamp: now,
    };
  }

  if (discMatch(bytes, DISC_MARKET_CREATED) && bytes.length >= 8 + 32 + 32) {
    const market = parsePubkey(bytes, 8);
    const creator = parsePubkey(bytes, 40);
    return {
      id, type: "MARKET_CREATED", actorPubkey: creator,
      actorDisplay: truncatePubkey(creator), badge: "Casual",
      market, signature: sig, timestamp: now,
    };
  }

  if (discMatch(bytes, DISC_MARKET_SETTLED) && bytes.length >= 8 + 32 + 1) {
    const market = parsePubkey(bytes, 8);
    const outcome = bytes[40] === 1 ? "Yes" : "No";
    return {
      id, type: "MARKET_SETTLED", actorPubkey: market,
      actorDisplay: truncatePubkey(market), badge: "Casual",
      market, outcome, signature: sig, timestamp: now,
    };
  }

  if (discMatch(bytes, DISC_PARLAY_SETTLED) && bytes.length >= 8 + 32 + 1) {
    const parlay = parsePubkey(bytes, 8);
    const won = bytes[40] === 1;
    return {
      id, type: won ? "PARLAY_WON" : "PARLAY_LOST", actorPubkey: parlay,
      actorDisplay: truncatePubkey(parlay), badge: "Casual",
      signature: sig, timestamp: now,
    };
  }

  if (discMatch(bytes, DISC_MATCHUP_CREATED) && bytes.length >= 8 + 32 + 32 + 32 + 1 + 8) {
    const challenger = parsePubkey(bytes, 40);
    const market = parsePubkey(bytes, 72);
    const stake = parseU64LE(bytes, 137) / 1_000_000;
    return {
      id, type: "MATCHUP_CREATED", actorPubkey: challenger,
      actorDisplay: truncatePubkey(challenger), badge: "Casual",
      market, amountUsdc: stake, signature: sig, timestamp: now,
    };
  }

  if (discMatch(bytes, DISC_MATCHUP_SETTLED) && bytes.length >= 8 + 32 + 32 + 8) {
    const winner = parsePubkey(bytes, 40);
    const payout = parseU64LE(bytes, 72) / 1_000_000;
    return {
      id, type: "MATCHUP_SETTLED", actorPubkey: winner,
      actorDisplay: truncatePubkey(winner), badge: "Casual",
      amountUsdc: payout, signature: sig, timestamp: now,
    };
  }

  return null;
}

// Fetch recent historical events from on-chain transaction logs.
// Called once on mount to hydrate the feed before the WebSocket delivers live events.
async function fetchHistoricalEvents(
  rpcUrl: string,
  programId: string,
  limit = 30
): Promise<LiveEvent[]> {
  // Step 1: get recent confirmed signatures for the program
  const sigsRes = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "hist-sigs",
      method: "getSignaturesForAddress",
      params: [programId, { limit, commitment: "confirmed" }],
    }),
  });
  const sigsJson = await sigsRes.json();
  const sigs: Array<{ signature: string; blockTime: number | null; err: unknown }> =
    sigsJson.result ?? [];
  const valid = sigs.filter((s) => !s.err);
  if (valid.length === 0) return [];

  // Step 2: batch-fetch transactions 5 at a time
  const events: LiveEvent[] = [];
  const BATCH = 5;
  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    const responses = await Promise.all(
      batch.map(({ signature }) =>
        fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: signature,
            method: "getTransaction",
            params: [signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
          }),
        })
          .then((r) => r.json())
          .catch(() => null)
      )
    );
    for (let j = 0; j < batch.length; j++) {
      const result = responses[j]?.result;
      if (!result) continue;
      const logs: string[] = result.meta?.logMessages ?? [];
      const sig = batch[j].signature;
      const blockTime = batch[j].blockTime;
      const ts = blockTime ? new Date(blockTime * 1_000) : new Date();
      for (const log of logs) {
        if (!log.startsWith("Program data: ")) continue;
        try {
          const bytes = Uint8Array.from(atob(log.slice("Program data: ".length)), (c) =>
            c.charCodeAt(0)
          );
          const ev = tryParseEvent(bytes, sig);
          if (ev) events.push({ ...ev, timestamp: ts, id: `hist-${sig}` });
        } catch {}
      }
    }
  }
  return events;
}

export function useHeliusEvents(maxEvents = 200) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectAttempt, setConnectAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const subIdRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const backoffRef = useRef(2_000);
  const hydratedRef = useRef(false);

  const addEvent = useCallback((ev: LiveEvent) => {
    setEvents((prev) => {
      // deduplicate by signature to avoid live WS duplicating a historical event
      if (prev.some((e) => e.signature === ev.signature)) return prev;
      return [ev, ...prev].slice(0, maxEvents);
    });
  }, [maxEvents]);

  // Historical hydration — runs once per mount
  useEffect(() => {
    if (!HELIUS_RPC_URL || !TERRACE_PROGRAM_ID || hydratedRef.current) return;
    hydratedRef.current = true;

    fetchHistoricalEvents(HELIUS_RPC_URL, TERRACE_PROGRAM_ID, 30)
      .then((historical) => {
        if (cancelledRef.current || historical.length === 0) return;
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.signature));
          const fresh = historical.filter((e) => !seen.has(e.signature));
          return [...prev, ...fresh]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, maxEvents);
        });
      })
      .catch(() => {}); // best-effort — live WS covers gaps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!HELIUS_RPC_URL || !TERRACE_PROGRAM_ID) return;
    cancelledRef.current = false;

    const wsUrl = HELIUS_RPC_URL.replace(/^https?:\/\//, "wss://");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 2_000; // reset backoff on successful connect
      setConnected(true);
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "logsSubscribe",
        params: [
          { mentions: [TERRACE_PROGRAM_ID] },
          { commitment: "confirmed" },
        ],
      }));
    };

    ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data as string);

        if (payload.id === 1 && payload.result != null) {
          subIdRef.current = payload.result;
          return;
        }

        if (payload.method !== "logsNotification") return;

        const { signature, logs } = payload.params.result.value;
        if (!Array.isArray(logs)) return;

        for (const log of logs as string[]) {
          if (!log.startsWith("Program data: ")) continue;
          const b64 = log.slice("Program data: ".length);
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const ev = tryParseEvent(bytes, signature);
          if (ev) addEvent(ev);
        }
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (cancelledRef.current) return;
      // Exponential backoff reconnect, capped at 30s
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, 30_000);
      setTimeout(() => {
        if (!cancelledRef.current) setConnectAttempt((n) => n + 1);
      }, delay);
    };

    return () => {
      cancelledRef.current = true;
      if (subIdRef.current != null && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          jsonrpc: "2.0", id: 2,
          method: "logsUnsubscribe",
          params: [subIdRef.current],
        }));
      }
      ws.close();
    };
  }, [addEvent, connectAttempt]);

  return { events, connected };
}
