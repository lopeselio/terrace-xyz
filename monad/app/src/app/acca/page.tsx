import { AccaBuilder } from "@/components/AccaBuilder";
import { Header } from "@/components/Header";

export default function Acca() {
  return (
    <>
      <Header title="Build a parlay" sub="2–8 legs · all must land" back="/me" />
      <AccaBuilder />
    </>
  );
}
