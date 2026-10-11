import { ChallengeView } from "@/components/ChallengeView";
import { Header } from "@/components/Header";

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Header title="1v1 challenge" sub="Settle it with a mate" back="/challenges" />
      <ChallengeView id={Number(id)} />
    </>
  );
}
