import { NextResponse } from "next/server";
import { gql } from "@/lib/server/indexer";

/** Read-only proxy so browsers can query the indexer without knowing where it runs. */
export async function POST(req: Request) {
  const { query, variables } = (await req.json()) as { query?: string; variables?: Record<string, unknown> };
  if (!query || /\b(mutation|subscription)\b/.test(query)) return NextResponse.json({ error: "read-only" }, { status: 400 });
  try {
    return NextResponse.json({ data: await gql(query, variables) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
