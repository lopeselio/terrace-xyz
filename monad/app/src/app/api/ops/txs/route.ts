import { NextResponse } from "next/server";
import { getTxCount } from "@/lib/server/txcount";

/** The transaction counter on /ops reads this; ?fresh asks for a recount. A 404 without the ops key, like the page. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = process.env.OPS_KEY;
  const params = new URL(req.url).searchParams;
  if (!key || params.get("key") !== key) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(await getTxCount(params.has("fresh")), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
