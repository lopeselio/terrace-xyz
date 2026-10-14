import { NextResponse } from "next/server";
import { compileTake } from "@/lib/server/compiler";

/** Errors come back as a short code the app turns into a football-language popup (see lib/errors.ts). */
export async function POST(req: Request) {
  const { text, fixtureId } = (await req.json().catch(() => ({}))) as { text?: string; fixtureId?: number };
  if (!text || text.length > 200 || !fixtureId) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  try {
    return NextResponse.json(await compileTake(text, Number(fixtureId)));
  } catch (e) {
    const message = (e as Error).message;
    console.warn(`compile-take: ${message}`);
    return NextResponse.json({ error: /match_data|football API/.test(message) ? "match_data" : "server" }, { status: 502 });
  }
}
