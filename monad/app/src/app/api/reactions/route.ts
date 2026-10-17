import { NextResponse } from "next/server";
import { isAddress, listWhere, safeKey, signedBy, table } from "@/lib/server/azure";
import { REACTIONS, reactNote } from "@/lib/streak";

/**
 * Emoji reactions on takes. One reaction per fan per take: a new emoji replaces the old one, an empty one
 * removes it. Stored in Azure Table Storage: partition = take id, row = fan address.
 *
 *   GET  /api/reactions?ids=12,13&me=0x…   -> { counts: { "12": { "🔥": 3 } }, mine: { "12": "🔥" } }
 *   POST { address, post, emoji, at, signature }
 */
type Row = { emoji: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(safeKey).slice(0, 90);
  const me = url.searchParams.get("me")?.toLowerCase() ?? "";
  if (!ids.length) return NextResponse.json({ counts: {}, mine: {} });
  try {
    const rows = await listWhere<Row>(table("reactions"), "PartitionKey", ids);
    const counts: Record<string, Record<string, number>> = {};
    const mine: Record<string, string> = {};
    for (const r of rows) {
      (counts[r.partitionKey] ??= {})[r.emoji] = (counts[r.partitionKey][r.emoji] ?? 0) + 1;
      if (r.rowKey === me) mine[r.partitionKey] = r.emoji;
    }
    return NextResponse.json({ counts, mine }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ counts: {}, mine: {} }, { headers: { "x-reactions": "unavailable" } });
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { address?: string; post?: string; emoji?: string; at?: number; signature?: `0x${string}` };
  const emoji = b.emoji ?? "";
  if (!isAddress(b.address) || !b.post || !safeKey(b.post) || !b.signature || typeof b.at !== "number" || (emoji && !(REACTIONS as readonly string[]).includes(emoji)))
    return NextResponse.json({ error: "That reaction didn't go through." }, { status: 400 });
  if (!(await signedBy(b.address, reactNote(b.address, b.post, emoji, b.at), b.signature, b.at)))
    return NextResponse.json({ error: "Sign in again to react." }, { status: 401 });

  const t = table("reactions");
  const key = { partitionKey: b.post, rowKey: b.address.toLowerCase() };
  try {
    if (emoji) await t.upsertEntity({ ...key, emoji, at: b.at }, "Replace");
    else await t.deleteEntity(key.partitionKey, key.rowKey).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Reactions are catching up. Try again in a moment." }, { status: 503 });
  }
}
