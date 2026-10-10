import { LeagueView } from "@/components/LeagueView";

export default async function LeaguePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ code?: string }> }) {
  const { id } = await params;
  const { code } = await searchParams;
  return <LeagueView leagueId={Number(id)} code={code ?? ""} />;
}
