import { NextResponse } from "next/server";
import { ensureTable, isAddress, signedBy } from "@/lib/server/azure";
import { BASELINE, sendPush, type Sub } from "@/lib/server/push";
import { DEFAULT_PREFS, deviceKey, pushNote, type PushPrefs } from "@/lib/push";

/**
 * This device's push notifications.
 *
 *   GET    /api/push?endpoint=…  -> { on, prefs }
 *   POST   { address, subscription, prefs, at, signature }  -> saves the device (signed by the fan)
 *   DELETE { endpoint }  -> turns this device off (the endpoint is the device's own secret)
 */
type Body = {
  address?: string;
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  prefs?: Partial<PushPrefs>;
  at?: number;
  signature?: `0x${string}`;
  test?: boolean;
};

async function find(endpoint: string) {
  const subs = await ensureTable("pushsubs");
  const key = deviceKey(endpoint);
  for await (const e of subs.listEntities<Sub>({ queryOptions: { filter: `RowKey eq '${key}'` } })) return e as Sub;
  return null;
}

export async function GET(req: Request) {
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ on: false, prefs: DEFAULT_PREFS });
  try {
    const s = await find(endpoint);
    return NextResponse.json(
      { on: !!s, fan: s?.partitionKey ?? null, prefs: s ? { results: s.results, challenges: s.challenges, followers: s.followers } : DEFAULT_PREFS },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Notifications are catching up." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const sub = b.subscription;
  if (!isAddress(b.address) || !sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth || typeof b.at !== "number" || !b.signature)
    return NextResponse.json({ error: "Notifications didn't turn on." }, { status: 400 });
  const prefs: PushPrefs = { ...DEFAULT_PREFS, ...b.prefs };
  const device = deviceKey(sub.endpoint);
  if (!(await signedBy(b.address, pushNote(b.address, device, prefs, b.at), b.signature, b.at)))
    return NextResponse.json({ error: "Sign in again to turn on notifications." }, { status: 401 });

  const fan = b.address.toLowerCase();
  try {
    const subs = await ensureTable("pushsubs");
    // A device belongs to one fan: drop it from anyone else who signed in here before.
    const old = await find(sub.endpoint);
    if (old && old.partitionKey !== fan) await subs.deleteEntity(old.partitionKey, old.rowKey).catch(() => {});
    if (!old || old.partitionKey !== fan) {
      // Start this fan's ledger afresh so turning on doesn't replay what happened while pushes were off.
      const sent = await ensureTable("pushsent");
      await sent.deleteEntity(fan, BASELINE).catch(() => {});
    }
    await subs.upsertEntity({ partitionKey: fan, rowKey: device, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...prefs, at: b.at }, "Replace");
    if (b.test) await sendPush({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { title: "You're on the terrace", body: "Results, challenges and new followers will land here.", url: "/", tag: "welcome" }).catch(() => {});
  } catch {
    return NextResponse.json({ error: "Notifications are catching up. Try again in a moment." }, { status: 503 });
  }
  return NextResponse.json({ on: true, prefs });
}

export async function DELETE(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!b.endpoint) return NextResponse.json({ error: "Unknown device." }, { status: 400 });
  try {
    const s = await find(b.endpoint);
    if (s) await (await ensureTable("pushsubs")).deleteEntity(s.partitionKey, s.rowKey);
  } catch {
    return NextResponse.json({ error: "Notifications are catching up. Try again in a moment." }, { status: 503 });
  }
  return NextResponse.json({ on: false });
}
