import { NextResponse } from "next/server";
import { gql } from "@/lib/server/indexer";

/*
 * Read-only proxy so browsers can query the indexer without knowing where it runs. Every open tab
 * polls, so identical queries share one upstream request and a few seconds of cache; if the hosted
 * indexer rate-limits us, fans get the last good answer instead of an empty screen.
 */
const FRESH_MS = 4_000;
const STALE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function POST(req: Request) {
  const { query, variables } = (await req.json()) as { query?: string; variables?: Record<string, unknown> };
  if (!query || /\b(mutation|subscription)\b/.test(query)) return NextResponse.json({ error: "read-only" }, { status: 400 });
  const key = query + JSON.stringify(variables ?? {});
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return NextResponse.json({ data: hit.data });
  try {
    let pending = inflight.get(key);
    if (!pending) {
      pending = gql(query, variables).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    const data = await pending;
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ data });
  } catch (e) {
    if (hit && Date.now() - hit.at < STALE_MS) return NextResponse.json({ data: hit.data, stale: true });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
