"use client";
import { useEffect, useState } from "react";
import type { OpeningLine } from "@/app/api/odds/route";

export type { OpeningLine };

let cached: Promise<Record<number, OpeningLine>> | null = null;

/** Bookmakers' opening lines for every scheduled match (fetched once per page load). */
export function useOpeningLines() {
  const [lines, setLines] = useState<Record<number, OpeningLine>>({});
  useEffect(() => {
    cached ??= fetch("/api/odds").then((r) => r.json()).catch(() => ({}));
    cached.then(setLines);
  }, []);
  return lines;
}
