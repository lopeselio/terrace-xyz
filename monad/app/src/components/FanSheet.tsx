"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FollowButton } from "./FollowButton";
import { Icon } from "./Icon";
import { Avatar, Badge, Sheet, ago, fanName, handle } from "./ui";
import { useAccount } from "@/lib/account";
import { query } from "@/lib/indexer";
import { points } from "@/lib/terracePoints";

type Fan = {
  isAgent: boolean; results: number; wins: number; winRateBps: number; streak: number; badge: number;
  followers: number; following: number; terracePoints: string; takesListed: number; takesWon: number;
};
type Take = { id: string; text: string; postedAt: string; room_id: string; backers: number; market: { bettors: number; question: { answer: number } } | null };

const BADGE = ["Casual", "Sharp", "Legend"];
const RESULT = ["", "Came in", "Didn't happen", "Void"] as const;

/** A fan's card, opened from any avatar or name in the feed: record, followers, latest takes, Follow. */
export function FanSheet({ who, name, onClose }: { who: string; name?: string; onClose: () => void }) {
  const { address } = useAccount();
  const [fan, setFan] = useState<Fan | null>(null);
  const [takes, setTakes] = useState<Take[] | null>(null);
  const id = who.toLowerCase();
  const me = address?.toLowerCase() === id;
  const shown = name || fanName(id);

  useEffect(() => {
    query<{ Player_by_pk: Fan | null; Message: Take[] }>(
      `query P($id: String!) {
        Player_by_pk(id: $id) { isAgent results wins winRateBps streak badge followers following terracePoints takesListed takesWon }
        Message(where: { author: { _eq: $id }, room_id: { _like: "match-%" }, replyTo: { _is_null: true } }, order_by: { postedAt: desc }, limit: 20) {
          id text postedAt room_id backers market { bettors question { answer } }
        }
      }`,
      { id },
    )
      .then((d) => {
        setFan(d.Player_by_pk);
        setTakes(d.Message.filter((m) => !m.text.startsWith("E2E ")));
      })
      .catch(() => setTakes([]));
  }, [id]);

  const rate = fan?.results ? `${Math.round(fan.winRateBps / 100)}%` : "–";
  return (
    <Sheet onClose={onClose}>
      <div className="fan-hd">
        <Avatar seed={id} name={fan?.isAgent ? shown : undefined} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fan-name">{me ? "You" : shown} {fan?.isAgent && <Badge tone="private">AI</Badge>}</div>
          <div className="umeta">@{fan?.isAgent ? shown.toLowerCase().replace(/\s+/g, ".") : handle(id)}{fan ? ` · ${BADGE[fan.badge] ?? "Casual"}` : ""}</div>
          <div className="fan-graph">
            <span><b>{fan?.followers ?? 0}</b> followers</span>
            <span><b>{fan?.following ?? 0}</b> following</span>
          </div>
        </div>
        {!me && <FollowButton who={id} />}
      </div>

      <div className="fan-stats">
        <div><b>{rate}</b><small>Win rate</small></div>
        <div><b>{fan?.results ?? 0}</b><small>Calls settled</small></div>
        <div><b>{fan && fan.streak > 0 ? fan.streak : 0}</b><small>Win streak</small></div>
        <div><b className="amber">{fan ? points(fan.terracePoints) : 0}</b><small>Points</small></div>
      </div>

      {!me && (
        <Link href={`/live?fan=${id}`} className="btn-out mute" style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }} onClick={onClose}>
          <Icon name="whistle" size={16} /> {shown}&apos;s game day
        </Link>
      )}

      <div className="eyebrow" style={{ margin: "16px 0 8px" }}>Latest takes</div>
      {takes === null && <div className="sk" style={{ height: 64, borderRadius: 14 }} />}
      {takes?.length === 0 && <p className="umeta">No takes yet.</p>}
      <div className="fan-takes">
        {takes?.map((t) => {
          const answer = t.market?.question.answer ?? 0;
          return (
            <Link key={t.id} href={`/m/${t.room_id.split("-")[1]}#take-${t.id}`} className="fan-take" onClick={onClose}>
              <p>{t.text}</p>
              <span className="umeta">
                {ago(t.postedAt)}
                {t.market ? ` · ${t.market.bettors} in` : t.backers ? ` · ${t.backers} backing` : ""}
                {answer > 0 && <> · <span className={answer === 1 ? "y" : answer === 2 ? "n" : undefined}>{RESULT[answer]}</span></>}
              </span>
            </Link>
          );
        })}
      </div>
    </Sheet>
  );
}
