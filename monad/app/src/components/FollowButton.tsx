"use client";
import { useState } from "react";
import { useFollows } from "@/lib/follows";

export function FollowButton({ who }: { who: string }) {
  const { follows, toggle, busy } = useFollows();
  const [failed, setFailed] = useState(false);
  const on = follows.has(who.toLowerCase());
  return (
    <button
      className={`btn-out${on ? " on" : ""}${failed ? " red" : ""}`}
      disabled={busy === who.toLowerCase()}
      onClick={() => {
        setFailed(false);
        toggle(who).catch(() => setFailed(true));
      }}
    >
      {failed ? "Try again" : on ? "Following" : "Follow"}
    </button>
  );
}
