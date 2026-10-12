"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "./account";
import { ADDR, followsAbi } from "./contracts";
import { query } from "./indexer";

/*
 * Who you follow. On chain (TerraceFollows) once it's deployed: follows sync across devices and the
 * fan you follow gets a notification. Until then, or when signed out, they're kept on this device.
 */
const KEY = "terrace.follows";
const onChain = () => !!ADDR.follows;

function readLocal(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

// One shared copy for every hook instance, so all Follow buttons agree.
let shared: Set<string> = new Set();
const announce = (next: Set<string>) => {
  shared = next;
  window.dispatchEvent(new Event("terrace-follows"));
};

export function useFollows() {
  const { status, address, send } = useAccount();
  const [follows, setFollows] = useState<Set<string>>(shared);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setFollows(new Set(shared));
    window.addEventListener("terrace-follows", sync);
    return () => window.removeEventListener("terrace-follows", sync);
  }, []);

  useEffect(() => {
    if (!onChain() || status !== "ready" || !address) {
      announce(readLocal());
      return;
    }
    query<{ Follow: { followee: string }[] }>(
      `query F($me: String!) { Follow(where: { follower: { _eq: $me }, active: { _eq: true } }) { followee } }`,
      { me: address.toLowerCase() },
    )
      .then((d) => announce(new Set(d.Follow.map((f) => f.followee))))
      .catch(() => {});
  }, [status, address]);

  const toggle = useCallback(
    async (who: string) => {
      const id = who.toLowerCase();
      const next = new Set(shared);
      const following = next.has(id);
      if (following) next.delete(id);
      else next.add(id);
      announce(next); // optimistic

      if (!onChain() || status !== "ready") {
        try {
          localStorage.setItem(KEY, JSON.stringify([...next]));
        } catch {}
        return;
      }
      setBusy(id);
      try {
        await send({ address: ADDR.follows!, abi: followsAbi, functionName: following ? "unfollow" : "follow", args: [who as Address] });
      } catch (e) {
        const back = new Set(shared);
        if (following) back.add(id);
        else back.delete(id);
        announce(back);
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [status, send],
  );

  return { follows, toggle, busy };
}
