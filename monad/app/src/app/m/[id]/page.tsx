import { notFound } from "next/navigation";
import { MatchDetail } from "@/components/MatchDetail";
import { matches } from "@/lib/server/football";

export const revalidate = 15;

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m] = await matches([Number(id)], 15_000);
  if (!m) notFound();
  return <MatchDetail m={m} />;
}
