"use client";
import { useCallback, useEffect, useState } from "react";

const KEY = "terrace.follows";

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Fans you follow (kept on this device). Every hook instance stays in sync. */
export function useFollows() {
  const [follows, setFollows] = useState<Set<string>>(new Set());
  useEffect(() => {
    const sync = () => setFollows(read());
    sync();
    window.addEventListener("terrace-follows", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("terrace-follows", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback((who: string) => {
    const next = read();
    const id = who.toLowerCase();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {}
    window.dispatchEvent(new Event("terrace-follows"));
  }, []);
  return { follows, toggle };
}
