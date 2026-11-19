/*
 * Live match updates. One watch per fixture however many chats hold markets on it: each poll reads a
 * fixture once, turns the change into events, holds them briefly (a VAR check, a quick second goal),
 * then sends one combined message to every chat with an open market on that match.
 */
import { liveCard, type LiveEvent } from "./format";

export type Snapshot = {
  id: number;
  status: string;
  elapsed: number | null;
  home: string;
  away: string;
  goals: { home: number | null; away: number | null };
  /** Detailed events when an events feed is configured (goal scorers, cards). */
  events?: { kind: "goal" | "red" | "yellow"; minute: number | null; team: string; player?: string }[];
};

export type HubDeps = {
  /** Reads the fixtures once (batched); must not be called per chat. */
  read: (fixtureIds: number[]) => Promise<Snapshot[]>;
  /** Fixtures that currently have at least one open chat market. */
  fixtures: () => number[];
  /** Chats with an open market on a fixture. */
  chats: (fixtureId: number) => number[];
  publish: (chatId: number, text: string, key: string) => void;
  now?: () => number;
  /** How long to hold events before sending (ms). */
  debounceMs?: number;
  /** Longest a burst can be held while events keep arriving (ms). */
  maxHoldMs?: number;
};

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const DONE = new Set(["FT", "AET", "PEN"]);

type Pending = { events: LiveEvent[]; first: number; last: number; snap: Snapshot };

export class FixtureHub {
  private last = new Map<number, Snapshot>();
  private seenEvents = new Map<number, number>();
  private held = new Map<number, Pending>();
  reads = 0;
  constructor(private d: HubDeps) {}

  private get now() {
    return (this.d.now ?? Date.now)();
  }

  /** One polling round: read every watched fixture once, diff, hold, and flush what's ready. */
  async poll() {
    const ids = [...new Set(this.d.fixtures())];
    if (ids.length) {
      this.reads++;
      const snaps = await this.d.read(ids);
      for (const s of snaps) this.ingest(s);
    }
    this.flush();
  }

  /** Turn a fresh snapshot into events compared with the previous one. */
  ingest(s: Snapshot) {
    const prev = this.last.get(s.id);
    this.last.set(s.id, s);
    if (!prev) {
      // First sight: remember where things stand, don't replay the match so far.
      this.seenEvents.set(s.id, s.events?.length ?? 0);
      return;
    }
    const out: LiveEvent[] = [];
    if (!LIVE.has(prev.status) && !DONE.has(prev.status) && s.status === "1H") out.push({ kind: "kickoff", minute: 0 });
    if (s.events) {
      const seen = this.seenEvents.get(s.id) ?? 0;
      for (const e of s.events.slice(seen)) out.push({ kind: e.kind, minute: e.minute, team: e.team, player: e.player });
      this.seenEvents.set(s.id, s.events.length);
    } else {
      const dh = (s.goals.home ?? 0) - (prev.goals.home ?? 0), da = (s.goals.away ?? 0) - (prev.goals.away ?? 0);
      for (let i = 0; i < dh; i++) out.push({ kind: "goal", minute: s.elapsed, team: s.home });
      for (let i = 0; i < da; i++) out.push({ kind: "goal", minute: s.elapsed, team: s.away });
    }
    if (prev.status !== "HT" && s.status === "HT") out.push({ kind: "ht", minute: 45 });
    if (!DONE.has(prev.status) && DONE.has(s.status)) out.push({ kind: "ft", minute: s.elapsed });
    if (out.length) this.hold(s, out);
  }

  private hold(s: Snapshot, events: LiveEvent[]) {
    const t = this.now;
    const p = this.held.get(s.id);
    if (p) {
      p.events.push(...events);
      p.last = t;
      p.snap = s;
    } else this.held.set(s.id, { events, first: t, last: t, snap: s });
  }

  /** Send held bursts that have gone quiet (or been held too long); full-time goes straight out. */
  flush(force = false) {
    const t = this.now;
    const debounce = this.d.debounceMs ?? 20_000, maxHold = this.d.maxHoldMs ?? 60_000;
    for (const [id, p] of this.held) {
      const ft = p.events.some((e) => e.kind === "ft");
      if (!force && !ft && t - p.last < debounce && t - p.first < maxHold) continue;
      this.held.delete(id);
      const s = p.snap;
      const text = liveCard(`${s.home} v ${s.away}`, `${s.goals.home ?? 0}-${s.goals.away ?? 0}`, p.events);
      for (const chat of this.d.chats(id)) this.d.publish(chat, text, `live-${id}`);
    }
  }

  snapshot(id: number) {
    return this.last.get(id);
  }
}
