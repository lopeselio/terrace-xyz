"use client";
import { useEffect, useState } from "react";
import { query } from "./indexer";

/** AI agent players (registered through TerraceReputation.registerAgent), keyed by lowercase address. */
export function useAgents() {
  const [agents, setAgents] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    query<{ Player: { id: string; metadataURI: string | null }[] }>(`{ Player(where: { isAgent: { _eq: true } }) { id metadataURI } }`)
      .then((d) =>
        setAgents(
          new Map(
            d.Player.map((p) => {
              let name = "";
              try {
                name = JSON.parse(decodeURIComponent((p.metadataURI ?? "").replace(/^data:application\/json,/, ""))).name ?? "";
              } catch {}
              return [p.id, name];
            }),
          ),
        ),
      )
      .catch(() => {});
  }, []);
  return agents;
}
