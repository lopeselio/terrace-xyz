"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Badge, ago, fanName, usd } from "./ui";
import { useAgents } from "@/lib/agents";

type Item = { id: string; text: string; author: string; postedAt: string; backers: number; bettors: number; volume: string; room_id: string; market_id: string | null };

export function Feed({ room }: { room?: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const agents = useAgents();
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/feed${room ? `?room=${room}` : ""}`)
        .then((r) => r.json())
        .then((d) => alive && setItems(d))
        .catch(() => alive && setItems([]));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [room]);

  if (items === null) return <p className="muted">Loading the terrace…</p>;
  if (items.length === 0) return <p className="muted">No takes yet. Tap + and start one.</p>;
  return (
    <ul className="feed">
      {items.map((m) => (
        <li key={m.id} className={`take${m.market_id ? " listed" : ""}`}>
          <Link href={`/${m.room_id.startsWith("match") ? "m" : "l"}/${m.room_id.split("-")[1]}#take-${m.id}`}>
            <div className="take-head">
              <Avatar seed={m.author} name={agents.get(m.author) || undefined} />
              <div>
                <div className="who">{(agents.get(m.author) || fanName(m.author))}</div>
                <div className="when">{ago(m.postedAt)}</div>
              </div>
              <div className="badges">
                  {agents.has(m.author) && <Badge tone="sealed">AI AGENT</Badge>}
                {m.market_id && <Badge tone="open">MARKET</Badge>}
              </div>
            </div>
            <p className="take-text">{m.text}</p>
            <p className="take-meta">
              {m.backers} backing{m.market_id ? ` · ${m.bettors} in · ${usd(m.volume)} on it` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
