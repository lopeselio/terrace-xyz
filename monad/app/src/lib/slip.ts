"use client";
/** The accumulator slip: legs picked across match pages, kept on this device until placed. */
export type SlipLeg = { key: string; label: string; side: 1 | 2; fixtureId: number; kind?: number; questionId?: string };
const KEY = "terrace.slip";

export function readSlip(): SlipLeg[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function writeSlip(legs: SlipLeg[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(legs.slice(0, 8)));
    window.dispatchEvent(new Event("terrace-slip"));
  } catch {}
}
export function toggleLeg(leg: SlipLeg) {
  const legs = readSlip();
  const rest = legs.filter((l) => l.fixtureId !== leg.fixtureId || (l.questionId ?? `k${l.kind}`) !== (leg.questionId ?? `k${leg.kind}`));
  writeSlip(rest.length < legs.length && legs.some((l) => l.key === leg.key) ? rest : [...rest, leg]);
}
