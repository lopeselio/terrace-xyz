import "server-only";
import { standardAnswer } from "@/lib/outcome";

/** Reads from the Envio indexer (Hasura GraphQL). History and feeds come from here, never from eth_getLogs. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const data = await raw<T>(query, variables);
  await fillStandardAnswers(data);
  return data;
}

async function raw<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(process.env.INDEXER_URL ?? "http://localhost:8080/v1/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data as T;
}

type Q = { kind: number; line?: number; answer: number; fixture: { id: string } | null };

/*
 * Indexer deployments before ceab2cd never answer standard questions (the oracle derives them from the
 * score), so they'd read as open forever. Fill them in from the fixture result for any question in the
 * response that carries kind, answer and fixture { id }. A no-op once the indexer answers them itself.
 */
async function fillStandardAnswers(data: unknown) {
  const open: Q[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    if (typeof o.kind === "number" && o.kind >= 1 && o.kind <= 5 && o.answer === 0 && (o.fixture as Q["fixture"])?.id) open.push(o as unknown as Q);
    Object.values(o).forEach(walk);
  };
  walk(data);
  if (!open.length) return;
  const ids = [...new Set(open.map((q) => q.fixture!.id))];
  try {
    const d = await raw<{ Fixture: { id: string; state: number; homeGoals: number; awayGoals: number }[] }>(
      `query F($ids: [String!]!) { Fixture(where: { id: { _in: $ids }, state: { _neq: 0 } }) { id state homeGoals awayGoals } }`,
      { ids },
    );
    const byId = new Map(d.Fixture.map((f) => [f.id, f]));
    for (const q of open) {
      const f = byId.get(q.fixture!.id);
      if (f) q.answer = standardAnswer(q.kind, q.line ?? 0, f);
    }
  } catch {}
}
