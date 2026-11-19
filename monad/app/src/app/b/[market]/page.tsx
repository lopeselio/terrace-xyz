import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { betHref, sharedTake } from "@/lib/server/share";

export const revalidate = 30;

type Props = { params: Promise<{ market: string }> };

/*
 * The link a fan posts to a WhatsApp group or iMessage thread. Its preview carries the take, the match and
 * the odds both ways; tapping through lands here with Back it / Fade it, which open the bet sheet.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await sharedTake((await params).market);
  if (!t) return { title: "Terrace" };
  const title = `“${t.text}”`;
  const description = `${t.match} · Back ${t.back} · Fade ${t.fade}. Tap to back or fade it on Terrace.`;
  const image = { url: `/api/card/take?market=${t.id}`, width: 1200, height: 630, alt: `${title} on Terrace` };
  return { title, description, openGraph: { title, description, images: [image], type: "website" }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

export default async function SharedTakePage({ params }: Props) {
  const t = await sharedTake((await params).market);
  if (!t) notFound();
  return (
    <div className="sec" style={{ paddingTop: 24 }}>
      <div className="flabel">{t.match}</div>
      <h1 style={{ margin: "8px 0 12px" }}>“{t.text}”</h1>
      <p className="umeta">{t.ruled ? "Settled from the match data by Chainlink." : "Settled by Chainlink's AI judge after full time. Unclear means refunds."}</p>
      {t.settled ? (
        <Link className="cta" href={`/m/${t.fixtureId}`}>See how it went</Link>
      ) : (
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Link className="cta" href={betHref(t, "yes")} style={{ flex: 1 }}>Back it · {t.back}</Link>
          <Link className="btn-out" href={betHref(t, "no")} style={{ flex: 1, textAlign: "center" }}>Fade it · {t.fade}</Link>
        </div>
      )}
    </div>
  );
}
