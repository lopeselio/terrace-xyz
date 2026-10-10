import { PluginCommand } from "@metamask/agent-wallet/plugin";
import { api, type Match } from "../../terrace.js";

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);

/** `mm terrace matches`: this week's matches on Terrace, live ones first. */
export default class TerraceMatches extends PluginCommand<{ matches: object[] }> {
  static description = "List this week's matches on Terrace (Monad testnet), live ones first, with each match's room id.";
  static examples = ["<%= config.bin %> terrace matches", "<%= config.bin %> terrace matches --json"];
  pluginCommandId = "terrace:matches";

  async execute() {
    const list = await api<Match[]>("/api/matches");
    const rows = list
      .filter((m) => !["FT", "AET", "PEN"].includes(m.status))
      .sort((a, b) => Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) || a.kickoff - b.kickoff)
      .map((m) => ({
        match: m.id,
        fixture: `${m.home.name} v ${m.away.name}`,
        state: LIVE.has(m.status) ? `LIVE ${m.elapsed ?? ""}'` : new Date(m.kickoff * 1000).toISOString(),
        score: m.goals.home === null ? "" : `${m.goals.home}-${m.goals.away}`,
      }));
    return { matches: rows };
  }
}
