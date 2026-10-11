import { redirect } from "next/navigation";
import { APP_URL } from "../../lib/site";

/** Old league invite links: send them to the league in the app (numeric ids) or the leagues screen. */
export default async function LeagueInvite({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  redirect(/^\d+$/.test(address) ? `${APP_URL}/l/${address}` : `${APP_URL}/leagues`);
}
