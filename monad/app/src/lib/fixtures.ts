/**
 * Display data for fixtures. The contract only stores ids, kickoffs and results;
 * team names live here. Use the results provider's match ids so the CRE workflow,
 * the contract and the UI all agree. Replace these with the matches you seed.
 */
export type FixtureMeta = { id: number; home: string; away: string; competition: string };

export const FIXTURES: FixtureMeta[] = [
  { id: 537785, home: "Arsenal", away: "Chelsea", competition: "Premier League" },
  { id: 537786, home: "Liverpool", away: "Man City", competition: "Premier League" },
  { id: 537787, home: "Spurs", away: "Newcastle", competition: "Premier League" },
  { id: 537788, home: "Aston Villa", away: "Man United", competition: "Premier League" },
];

export function fixtureMeta(id: bigint | number): FixtureMeta {
  const n = Number(id);
  return FIXTURES.find((f) => f.id === n) ?? { id: n, home: "Home", away: "Away", competition: `Match ${n}` };
}
