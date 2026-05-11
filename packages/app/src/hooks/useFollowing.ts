import * as SecureStore from "expo-secure-store";
import { useState, useEffect, useCallback } from "react";

// SecureStore key is per wallet — base58 pubkeys are alphanumeric, safe as key suffix
const storeKey = (pk: string) => `terrace_flw_${pk}`;

export function useFollowing(myPubkey: string | null) {
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!myPubkey) {
      setFollowing(new Set());
      setLoaded(true);
      return;
    }
    let active = true;
    SecureStore.getItemAsync(storeKey(myPubkey))
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try { setFollowing(new Set(JSON.parse(raw) as string[])); } catch {}
        }
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [myPubkey]);

  const toggle = useCallback((pubkey: string) => {
    if (!myPubkey) return;
    setFollowing((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      SecureStore.setItemAsync(storeKey(myPubkey), JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, [myPubkey]);

  const isFollowing = useCallback((pubkey: string) => following.has(pubkey), [following]);

  return { following, toggle, isFollowing, loaded };
}
