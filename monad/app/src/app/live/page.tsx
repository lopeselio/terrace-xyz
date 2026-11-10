import type { Metadata } from "next";
import { GameDay } from "@/components/GameDay";
import { fanName } from "@/lib/names";

type Props = { searchParams: Promise<{ fan?: string }> };
const valid = (fan?: string) => (fan && /^0x[0-9a-fA-F]{40}$/.test(fan) ? fan.toLowerCase() : undefined);

/** A shared game day unfurls as that fan's matchday card. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const fan = valid((await searchParams).fan);
  if (!fan) return {};
  const title = `${fanName(fan)}'s matchday on Terrace`;
  const images = [{ url: `/api/card?fan=${fan}`, width: 1200, height: 630 }];
  return { title, openGraph: { title, images }, twitter: { card: "summary_large_image", title, images } };
}

export default async function Live({ searchParams }: Props) {
  return <GameDay fan={valid((await searchParams).fan)} />;
}
