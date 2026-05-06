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

export function useHeliusEvents(maxEvents = 50) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subIdRef = useRef<number | null>(null);

  const addEvent = useCallback((ev: LiveEvent) => {
    setEvents((prev) => [ev, ...prev].slice(0, maxEvents));
  }, [maxEvents]);

  useEffect(() => {
    if (!HELIUS_RPC_URL || !TERRACE_PROGRAM_ID) return;

    const wsUrl = HELIUS_RPC_URL.replace(/^https?:\/\//, "wss://");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
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
    };

    return () => {
      if (subIdRef.current != null && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          jsonrpc: "2.0", id: 2,
          method: "logsUnsubscribe",
          params: [subIdRef.current],
        }));
      }
      ws.close();
    };
  }, [addEvent]);

  return { events, connected };
}
