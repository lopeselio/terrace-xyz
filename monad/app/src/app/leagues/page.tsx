import { LeaguesHome, type OpenLeague } from "@/components/LeaguesHome";
import { gql } from "@/lib/server/indexer";

export const revalidate = 10;

export default async function Leagues({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  let leagues: OpenLeague[] = [];
  try {
    leagues = (
      await gql<{ League: OpenLeague[] }>(
        `{ League(where: { isPrivate: { _eq: false }, ended: { _eq: false } }, order_by: { memberCount: desc }, limit: 30) { id name memberCount gameweeks isPrivate entryFee } }`,
      )
    ).League;
  } catch {}
  return <LeaguesHome open={leagues} tab={tab === "create" || tab === "join" ? tab : "mine"} />;
}
