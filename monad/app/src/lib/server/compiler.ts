import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { describeRule, parseRule, type Names, type Rule } from "@shared/rules";
import { football } from "./football";

/**
 * The take compiler: turns a chat take into a rule CRE can settle from match data.
 * The AI only writes the rule; the plain-English reading the fan confirms is generated
 * from the rule by code (describeRule), so what they agree to is exactly what gets checked.
 * Takes that can't be expressed as a rule come back rule-less and go to the AI judge after
 * full time instead.
 */

type Squad = { team: { id: number; name: string }; players: { id: number; name: string }[] };
type Detail = {
  fixture: { date: string; status: { short: string; elapsed: number | null } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  lineups?: { team: { id: number; name: string }; startXI: { player: { id: number; name: string } }[]; substitutes: { player: { id: number; name: string } }[] }[];
};

const GRAMMAR = `Rule = { "v": 1, "left": Metric, "op": ">=" | ">" | "==" | "<=" | "<", "value"?: number, "right"?: Metric }  (exactly one of value/right)
Metric (exactly one key):
  { "events": { "type"?: "Goal" | "Card" | "subst" | "Var", "detail"?: string, "team"?: teamId, "player"?: playerId, "assist"?: playerId, "minute"?: [from, to] } }  -> number of matching events
     detail values: Goal: "Normal Goal" | "Own Goal" | "Penalty" | "Missed Penalty"; Card: "Yellow Card" | "Red Card"
     minute window is inclusive; stoppage time counts as the last minute of its half (45 or 90). Omit for the whole match.
  { "lineup": { "player": playerId } }  -> 1 if in the starting XI else 0
  { "stat": { "team": teamId, "type": "Shots on Goal" | "Total Shots" | "Corner Kicks" | "Fouls" | "Offsides" | "Ball Possession" | "Yellow Cards" | "Red Cards" | "Goalkeeper Saves" | "Total passes" | "expected_goals" } }
  { "player": { "player": playerId, "field": "goals.total" | "goals.assists" | "goals.saves" | "shots.total" | "shots.on" | "passes.total" | "passes.key" | "tackles.total" | "cards.yellow" | "cards.red" | "fouls.committed" | "dribbles.success" | "games.minutes" } }
  { "score": { "side": "home" | "away" | "total", "period"?: "fulltime" | "halftime" } }`;

function prompt(take: string, d: Detail, players: { id: number; name: string; team: string }[], now: string) {
  return `You compile football fan "takes" into machine-checkable rules for a prediction market.
Match: ${d.teams.home.name} (team ${d.teams.home.id}, home) v ${d.teams.away.name} (team ${d.teams.away.id}, away). Kickoff ${d.fixture.date}. Status ${d.fixture.status.short}${d.fixture.status.elapsed ? `, minute ${d.fixture.status.elapsed}` : ""}. Now: ${now}.
Players (id: name, team):
${players.map((p) => `${p.id}: ${p.name} (${p.team})`).join("\n")}

Rule language:
${GRAMMAR}

The take: "${take}"

Translate the take into ONE rule that is YES exactly when the take comes true. Use only ids from the lists above.
Relative times like "in the next 20 minutes" mean a minute window starting at the current minute (or minute 0 before kickoff).
"Wins" for a team means its score is greater than the other side's: use left/right score metrics.
If the take is subjective, about something not in the data (celebrations, outfits, transfers, goal style like headers),
or you are not sure which player is meant, return null for rule.
Reply with JSON only: {"rule": Rule | null, "windowStart": number | null}  (windowStart = first minute of the window, if any).`;
}

async function askGemini(text: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const out = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function askClaude(text: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    // A short, well-specified translation: thinking is always on for this model, so keep effort low.
    output_config: { effort: "low" },
    messages: [{ role: "user", content: text }],
  } as never);
  if (msg.stop_reason === "refusal") return "{}";
  const blocks = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  return blocks.map((b) => b.text).join("");
}

export type Compiled = {
  rule: Rule | null;
  spec: string; // JSON rule, or "" for the AI judge
  reading: string;
  closeTime: number; // unix seconds: when bets on this take stop
};

export async function compileTake(take: string, fixtureId: number): Promise<Compiled> {
  const [d] = await football<Detail[]>(`/fixtures?id=${fixtureId}`, 15_000);
  if (!d) throw new Error("unknown match");

  // Player names: lineups once published, otherwise both squads.
  let players: { id: number; name: string; team: string }[] = [];
  if (d.lineups?.length) {
    for (const l of d.lineups) for (const p of [...l.startXI, ...l.substitutes]) players.push({ id: p.player.id, name: p.player.name, team: l.team.name });
  } else {
    for (const t of [d.teams.home, d.teams.away]) {
      const [squad] = await football<Squad[]>(`/players/squads?team=${t.id}`, 6 * 3600_000);
      for (const p of squad?.players ?? []) players.push({ id: p.id, name: p.name, team: t.name });
    }
  }

  const ask = process.env.AI_PROVIDER === "anthropic" ? askClaude : askGemini;
  const raw = await ask(prompt(take, d, players, new Date().toISOString()));
  let parsed: { rule?: unknown; windowStart?: number | null } = {};
  try {
    parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
  } catch {}
  const rule = parsed.rule ? parseRule(JSON.stringify(parsed.rule)) : null;

  const names: Names = {
    teams: { [d.teams.home.id]: d.teams.home.name, [d.teams.away.id]: d.teams.away.name },
    players: Object.fromEntries(players.map((p) => [p.id, p.name])),
  };

  // Bets close when the take's window opens (in-match), at kickoff (before the match),
  // or two minutes from now for an in-play take with no window.
  const kickoff = Math.floor(Date.parse(d.fixture.date) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const live = !["NS", "TBD"].includes(d.fixture.status.short);
  const elapsed = d.fixture.status.elapsed ?? 0;
  let closeTime = live ? now + 120 : kickoff;
  if (live && typeof parsed.windowStart === "number" && parsed.windowStart > elapsed) {
    closeTime = now + (parsed.windowStart - elapsed) * 60;
  }

  return {
    rule,
    spec: rule ? JSON.stringify(rule) : "",
    reading: rule ? describeRule(rule, names) : "No data rule fits this one: the AI judge will rule on it after full time, using the match report.",
    closeTime,
  };
}
