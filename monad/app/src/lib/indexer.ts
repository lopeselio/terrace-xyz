"use client";
/** Browser-side reads from the Envio indexer, through the read-only /api/indexer proxy. */
export async function query<T>(q: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/indexer", { method: "POST", body: JSON.stringify({ query: q, variables }) });
  const body = (await res.json()) as { data?: T; error?: string };
  if (!body.data) throw new Error(body.error ?? "indexer unavailable");
  return body.data;
}

export type RoomMessage = {
  id: string;
  author: string;
  text: string;
  postedAt: string;
  backers: number;
  replyTo: string | null;
  market: null | {
    id: string;
    token: string;
    yesPool: string;
    noPool: string;
    bettors: number;
    question: { id: string; answer: number; closeTime: string; spec: string | null };
  };
};

export const ROOM_QUERY = `query Room($room: String!) {
  Message(where: { room_id: { _eq: $room } }, order_by: { postedAt: asc }, limit: 150) {
    id author text postedAt backers replyTo
    market { id token yesPool noPool bettors question { id answer closeTime spec } }
  }
}`;
