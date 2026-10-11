import { ChallengeList } from "@/components/ChallengeList";
import { Header } from "@/components/Header";

export default function Challenges() {
  return (
    <>
      <Header title="1v1 Matchups" sub="Head to head with a mate" back="/me" />
      <ChallengeList />
    </>
  );
}
