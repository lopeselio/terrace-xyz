import type { Metadata } from "next";
import { ChallengeClient } from "./ChallengeClient";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "You've been challenged on Terrace",
    description: "Call the scores before kickoff. Free to play.",
    openGraph: { title: "You've been challenged on Terrace", images: [`/c/${id}/opengraph-image`] },
  };
}

export default async function ChallengePage({ params }: Props) {
  const { id } = await params;
  return <ChallengeClient contestId={BigInt(id)} />;
}
