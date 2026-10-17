import "server-only";
import { TableClient } from "@azure/data-tables";
import { verifyMessage, type Address, type Hex } from "viem";

/*
 * Azure Table Storage (storage account in the terrace-runners resource group) for the social bits that
 * don't belong on chain: emoji reactions and streak repairs. Writes are signed by the fan's Mera session
 * and checked here, so nobody can react or spend points as someone else.
 */

const conn = () => {
  const c = process.env.AZURE_TABLES_CONNECTION;
  if (!c) throw new Error("AZURE_TABLES_CONNECTION is not set");
  return c;
};

const clients = new Map<string, TableClient>();
export function table(name: "reactions" | "streakrepairs") {
  let c = clients.get(name);
  if (!c) {
    c = TableClient.fromConnectionString(conn(), name);
    clients.set(name, c);
  }
  return c;
}

/** OData-safe key: addresses and numeric ids only. */
export const safeKey = (s: string) => /^[0-9a-z]{1,64}$/.test(s);
export const isAddress = (s: unknown): s is Address => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);

/** A note signed within the last 5 minutes by `address`. */
export async function signedBy(address: Address, message: string, signature: Hex, at: number) {
  if (Math.abs(Date.now() / 1000 - at) > 300) return false;
  try {
    return await verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}

/** Run a filtered query in chunks (Azure Tables allows 15 comparisons per filter). */
export async function listWhere<T extends object>(t: TableClient, field: string, values: string[]) {
  const out: (T & { partitionKey: string; rowKey: string })[] = [];
  for (let i = 0; i < values.length; i += 15) {
    const filter = values.slice(i, i + 15).map((v) => `${field} eq '${v}'`).join(" or ");
    for await (const e of t.listEntities<T>({ queryOptions: { filter } })) out.push(e as T & { partitionKey: string; rowKey: string });
  }
  return out;
}
