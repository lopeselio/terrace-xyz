import "server-only";
import { gql } from "./indexer";
import { matches } from "./football";
import { fractional, price } from "@/lib/odds";

/*
 * A listed take as a group-chat link: the words, the match, the odds both ways and where Back / Fade
 * land. Feeds the /b/<market> page's link preview, which WhatsApp, iMessage and Telegram all unfurl.
 */
export type SharedTake = {
  id: string;
  text: string;
  match: string;
  fixtureId: number;
  kickoff: number | null;
  ruled: boolean;
  back: string;
  fade: string;
  pot: number;
  bettors: number;
  takeId: string | null;
  settled: boolean;
};

type Row = { id: string; yesPool: string; noPool: string; bettors: number; take: { id: string } | null; question: { text: string; spec: string; answer: number; fixture: { id: string } | null } };

export async function sharedTake(id: string): Promise<SharedTake | null> {
  if (!/^\d+$/.test(id)) return null;
  const d = await gql<{ Market: Row[] }>(
    `query($id: String!) { Market(where: { id: { _eq: $id } }, limit: 1) { id yesPool noPool bettors take { id } question { text spec answer fixture { id } } } }`,
    { id },
  ).catch(() => null);
  const m = d?.Market[0];
  if (!m) return null;
  const fixtureId = Number(m.question.fixture?.id ?? 0);
  const [f] = fixtureId ? await matches([fixtureId]).catch(() => []) : [];
  const yes = Number(m.yesPool), no = Number(m.noPool);
  return {
    id: m.id,
    text: m.question.text,
    match: f ? `${f.home.name} v ${f.away.name}` : "Terrace",
    fixtureId,
    kickoff: f?.kickoff ?? null,
    ruled: !!m.question.spec && m.question.spec !== "0x",
    back: fractional(price({ side: yes, other: no }).decimal),
    fade: fractional(price({ side: no, other: yes }).decimal),
    pot: (yes + no) / 1e6,
    bettors: m.bettors,
    takeId: m.take?.id ?? null,
    settled: m.question.answer > 0,
  };
}

/** Where Back / Fade go: the take in its match room with the bet sheet open on that side. */
export const betHref = (t: SharedTake, side: "yes" | "no") =>
  t.takeId ? `/m/${t.fixtureId}?bet=${side}&via=share#take-${t.takeId}` : `/m/${t.fixtureId}`;
