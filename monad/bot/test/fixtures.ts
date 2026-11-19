import type { Fixture } from "../src/parse";

// Sun 22 Nov 2026 16:30 London, Sat 21 Nov 15:00, Sun 22 Nov 14:00, Tue 24 Nov 20:00
export const NOW = Date.UTC(2026, 10, 20, 12, 0) / 1000; // Fri 20 Nov 2026 12:00 UTC
const t = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h, m) / 1000;
export const FIXTURES: Fixture[] = [
  { id: 101, kickoff: t(22, 16, 30), status: "NS", league: "Premier League", home: { name: "Arsenal" }, away: { name: "Chelsea" } },
  { id: 102, kickoff: t(21, 15), status: "NS", league: "Premier League", home: { name: "Liverpool" }, away: { name: "Manchester City" } },
  { id: 103, kickoff: t(22, 14), status: "NS", league: "Premier League", home: { name: "Tottenham" }, away: { name: "Manchester United" } },
  { id: 104, kickoff: t(25, 20), status: "NS", league: "UEFA Champions League", home: { name: "Arsenal" }, away: { name: "Bayern Munich" } },
  { id: 105, kickoff: t(18, 20), status: "FT", league: "Premier League", home: { name: "Chelsea" }, away: { name: "Everton" } },
];
