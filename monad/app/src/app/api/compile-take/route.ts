import { NextResponse } from "next/server";
import { compileTake } from "@/lib/server/compiler";

export async function POST(req: Request) {
  const { text, fixtureId } = (await req.json().catch(() => ({}))) as { text?: string; fixtureId?: number };
  if (!text || text.length > 200 || !fixtureId) return NextResponse.json({ error: "bad input" }, { status: 400 });
  try {
    return NextResponse.json(await compileTake(text, Number(fixtureId)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
