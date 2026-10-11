"use client";
import { useFollows } from "@/lib/follows";

export function FollowButton({ who }: { who: string }) {
  const { follows, toggle } = useFollows();
  const on = follows.has(who.toLowerCase());
  return (
    <button className={`btn-out${on ? " on" : ""}`} onClick={() => toggle(who)}>
      {on ? "Following" : "Follow"}
    </button>
  );
}
