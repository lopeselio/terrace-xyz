import { NextResponse } from "next/server";
import { isAddress, signedBy, table } from "@/lib/server/azure";
import { gql } from "@/lib/server/indexer";
import { MAX_GAP, REPAIR_COST, dayOf, repairNote, streakState, today } from "@/lib/streak";

/**
 * Day streaks and repairs. Played days come from the indexer (DAILY Terrace Points); repaired days and
 * the points spent on them live in Azure Table Storage (partition = fan, row = UTC day number).
 *
 *   GET  /api/streak?who=0x…  -> { days, repaired, spent, points, today }
 *   POST { address, days, at, signature }  -> repairs those days if they're the fan's current break
 */
type Repair = { cost: number; at: number };

async function load(who: string) {
  const d = await gql<{ PointsEvent: { timestamp: string }[]; Player_by_pk: { terracePoints: string } | null }>(
    `query S($who: String!) {
      PointsEvent(where: { player: { _eq: $who }, reason: { _eq: "DAILY" } }, order_by: { timestamp: desc }, limit: 400) { timestamp }
      Player_by_pk(id: $who) { terracePoints }
    }`,
    { who },
  );
  const repairs: { day: number; cost: number }[] = [];
  try {
    for await (const e of table("streakrepairs").listEntities<Repair>({ queryOptions: { filter: `PartitionKey eq '${who}'` } }))
      repairs.push({ day: Number(e.rowKey), cost: Number(e.cost) });
  } catch {}
  const days = [...new Set(d.PointsEvent.map((p) => dayOf(p.timestamp)))].sort((a, b) => a - b);
  const spent = repairs.reduce((s, r) => s + r.cost, 0);
  return { days, repaired: repairs.map((r) => r.day).sort((a, b) => a - b), spent, points: Number(d.Player_by_pk?.terracePoints ?? 0) - spent, today: today() };
}

export async function GET(req: Request) {
  const who = new URL(req.url).searchParams.get("who") ?? "";
  if (!isAddress(who)) return NextResponse.json({ error: "Unknown fan." }, { status: 400 });
  try {
    return NextResponse.json(await load(who.toLowerCase()), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your streak is catching up." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { address?: string; days?: number[]; at?: number; signature?: `0x${string}` };
  if (!isAddress(b.address) || !Array.isArray(b.days) || !b.days.length || b.days.length > MAX_GAP || !b.signature || typeof b.at !== "number")
    return NextResponse.json({ error: "That repair didn't go through." }, { status: 400 });
  if (!(await signedBy(b.address, repairNote(b.address, b.days, b.at), b.signature, b.at)))
    return NextResponse.json({ error: "Sign in again to repair your streak." }, { status: 401 });

  const who = b.address.toLowerCase();
  const s = await load(who).catch(() => null);
  if (!s) return NextResponse.json({ error: "Your streak is catching up. Try again in a moment." }, { status: 503 });

  const { gap } = streakState(new Set([...s.days, ...s.repaired]), s.today);
  if (gap.join(",") !== [...b.days].sort((x, y) => x - y).join(","))
    return NextResponse.json({ error: "There's nothing to repair right now." }, { status: 409 });
  const cost = gap.length * REPAIR_COST;
  if (s.points < cost) return NextResponse.json({ error: `You need ${cost} points to repair this. Play a few more to earn them.` }, { status: 402 });

  // createEntity fails if the day is already repaired, so a double tap can't charge twice.
  const t = table("streakrepairs");
  const done: number[] = [];
  try {
    for (const day of gap) {
      await t.createEntity({ partitionKey: who, rowKey: String(day), cost: REPAIR_COST, at: b.at });
      done.push(day);
    }
  } catch {
    if (!done.length) return NextResponse.json({ error: "Already repaired." }, { status: 409 });
  }
  return NextResponse.json(await load(who));
}
