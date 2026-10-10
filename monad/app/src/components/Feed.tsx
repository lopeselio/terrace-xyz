"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; text: string; author: string; backers: number; bettors: number; volume: string; room_id: string; market_id: string | null };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const dollars = (v: string) => `$${(Number(v) / 1e6).toFixed(0)}`;

export function Feed({ room }: { room?: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
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
  if (items.length === 0) return <p className="muted">No takes yet. Open a match and start one.</p>;
  return (
    <ul className="feed">
      {items.map((m) => (
        <li key={m.id} className="take">
          <Link href={`/${m.room_id.startsWith("match") ? "m" : "l"}/${m.room_id.split("-")[1]}#take-${m.id}`}>
            <p className="take-text">{m.text}</p>
            <p className="take-meta">
              {short(m.author)} · {m.backers} backing{m.market_id ? ` · ${m.bettors} in · ${dollars(m.volume)} on it` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
