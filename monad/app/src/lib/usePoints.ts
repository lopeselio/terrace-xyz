"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useAccount } from "./account";
import { query } from "./indexer";

/*
 * The signed-in fan's Terrace Points, shared by every pill and card on screen. While something
 * is being locked in, `charging` is on (the bolt glows); once the indexer counts the new points,
 * the total moves and charging stops. Points lag the transaction by a few seconds, so after a
 * success we poll quickly for a while instead of waiting for the slow refresh.
 */

type State = { total: number | null; charging: boolean };

let state: State = { total: null, charging: false };
let me: string | null = null;
let users = 0;
let fastUntil = 0;
let fastTimer: ReturnType<typeof setTimeout> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;
let busy = 0;
let sent = false;
const subs = new Set<() => void>();

const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

async function load() {
  if (!me) return;
  const who = me;
  try {
    const d = await query<{ Player_by_pk: { terracePoints: string } | null }>(
      `query TP($me: String!) { Player_by_pk(id: $me) { terracePoints } }`,
      { me: who },
    );
    if (who !== me) return;
    const total = Number(d.Player_by_pk?.terracePoints ?? 0);
    const grew = state.total !== null && total > state.total;
    set({ total, charging: grew ? false : state.charging });
    if (grew) fastUntil = 0;
  } catch {}
}

// After a success: check every 2.5s for up to 30s, then give up on the glow.
function chase() {
  if (fastTimer) clearTimeout(fastTimer);
  if (Date.now() > fastUntil) {
    if (busy === 0) set({ charging: false });
    return;
  }
  fastTimer = setTimeout(async () => {
    await load();
    chase();
  }, 2500);
}

function onBusy(e: Event) {
  const d = (e as CustomEvent<number>).detail;
  busy = Math.max(0, busy + d);
  if (d > 0) {
    sent = false;
    set({ charging: true });
  } else if (busy === 0 && !sent && Date.now() > fastUntil) {
    set({ charging: false }); // it failed or was cancelled: nothing to wait for
  }
}

function onSent() {
  sent = true;
  set({ charging: true });
  onChange();
}

// A balance moved (a collect, a top-up): points may follow, so look sooner, without the glow.
function onChange() {
  fastUntil = Date.now() + 30_000;
  chase();
}

function start() {
  window.addEventListener("terrace-busy", onBusy);
  window.addEventListener("terrace-sent", onSent);
  window.addEventListener("terrace-balance", onChange);
  slowTimer = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
}

function stop() {
  window.removeEventListener("terrace-busy", onBusy);
  window.removeEventListener("terrace-sent", onSent);
  window.removeEventListener("terrace-balance", onChange);
  if (slowTimer) clearInterval(slowTimer);
  if (fastTimer) clearTimeout(fastTimer);
  slowTimer = fastTimer = null;
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function usePoints() {
  const { address } = useAccount();
  const s = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (users++ === 0) start();
    return () => {
      if (--users === 0) stop();
    };
  }, []);

  useEffect(() => {
    const next = address?.toLowerCase() ?? null;
    if (next === me) return;
    me = next;
    set({ total: null, charging: false });
    load();
  }, [address]);

  return s;
}
