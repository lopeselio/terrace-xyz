import { ChallengeView } from "@/components/ChallengeView";

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeView id={Number(id)} />;
}
