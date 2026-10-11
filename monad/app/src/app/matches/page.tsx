import { FixtureList } from "@/components/FixtureCard";
import { Header } from "@/components/Header";

export default function Matches() {
  return (
    <>
      <Header title="Fixtures" sub="Every match has a room and a market" back="/" />
      <FixtureList />
    </>
  );
}
