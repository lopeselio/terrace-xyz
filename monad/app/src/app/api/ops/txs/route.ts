import { NextResponse } from "next/server";
import { getTxCount } from "@/lib/server/txcount";

/** The live transaction counter on /ops polls this. A 404 without the ops key, like the page. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = process.env.OPS_KEY;
  if (!key || new URL(req.url).searchParams.get("key") !== key) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(await getTxCount(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
