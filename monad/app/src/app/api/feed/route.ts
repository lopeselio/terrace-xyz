import { NextResponse } from "next/server";
import { gql } from "@/lib/server/indexer";

/**
 * The ranked feed ("competitive feed algorithm").
 * Each message carries a time-independent heat from the indexer: backers x2, bettors x3,
 * 4 x log10(dollars staked + 1), plus up to +3 for authors whose past takes came in.
 * Here it's decayed by age so fresh takes can break through:  (heat + 1) / (hours + 2)^1.5
 */
type Row = {
  id: string;
  text: string;
  author: string;
  postedAt: string;
  backers: number;
  bettors: number;
  volume: string;
  heat: string;
  room_id: string;
  market_id: string | null;
};

export async function GET(req: Request) {
  const room = new URL(req.url).searchParams.get("room");
  const since = Math.floor(Date.now() / 1000) - 3 * 86_400;
  try {
    const data = await gql<{ Message: Row[] }>(
      `query Feed($since: numeric!, $room: String) {
        Message(where: { postedAt: { _gte: $since }, room_id: { _eq: $room } }, order_by: { heat: desc }, limit: 200) {
          id text author postedAt backers bettors volume heat room_id market_id
        }
      }`.replace(", room_id: { _eq: $room }", room ? ", room_id: { _eq: $room }" : ""),
      room ? { since, room } : { since },
    );
    const now = Date.now() / 1000;
    const ranked = data.Message.map((m) => {
      const hours = (now - Number(m.postedAt)) / 3600;
      return { ...m, rank: (Number(m.heat) + 1) / Math.pow(hours + 2, 1.5) };
    })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 40);
    return NextResponse.json(ranked);
  } catch {
    return NextResponse.json([], { headers: { "x-indexer": "unavailable" } });
  }
}
