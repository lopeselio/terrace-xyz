import { NextResponse } from "next/server";
import { runPush } from "@/lib/server/push";

/** One push round (results, challenges, followers, swings): called every minute by the terrace-push timer on the Azure VM, with the cron key. */
export const maxDuration = 60;

export async function POST(req: Request) {
  const key = process.env.PUSH_CRON_KEY;
  if (!key || req.headers.get("authorization") !== `Bearer ${key}`) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(await runPush());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
