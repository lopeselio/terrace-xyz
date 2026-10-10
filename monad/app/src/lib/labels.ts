/** Plain-English names for oracle questions. */
export type QuestionLike = { kind: number; line: number; text: string; fixture?: { id: string } | null };
export type MatchNames = { home: { name: string }; away: { name: string } };

export function questionLabel(q: QuestionLike, match?: MatchNames): string {
  const home = match?.home.name ?? "Home";
  const away = match?.away.name ?? "Away";
  switch (q.kind) {
    case 1: return `${home} win`;
    case 2: return `${home} v ${away}: draw`;
    case 3: return `${away} win`;
    case 4: return `Over ${q.line}.5 goals in ${home} v ${away}`;
    case 5: return `Both teams score in ${home} v ${away}`;
    default: return q.text;
  }
}

export const sideLabel = (side: number, q: QuestionLike) => (side === 1 ? "Yes" : q.kind >= 1 && q.kind <= 3 ? "No" : "Not happening");

const SHORT: Record<string, string> = {
  "Manchester City": "Man City",
  "Manchester United": "Man Utd",
  "Nottingham Forest": "Forest",
  "Crystal Palace": "Palace",
  "Aston Villa": "Villa",
  "Tottenham": "Spurs",
  "Wolverhampton Wanderers": "Wolves",
  "West Ham": "West Ham",
  "Newcastle": "Newcastle",
  "Sheffield Utd": "Sheff Utd",
  "Hull City": "Hull",
};

/** Short club names for buttons ("Man City", not "Manchester"). */
export const shortTeam = (name: string) => SHORT[name] ?? (name.length <= 10 ? name : name.split(" ")[0]);
