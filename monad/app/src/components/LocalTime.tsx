"use client";
import { useEffect, useState } from "react";

/** Kickoff times in the fan's own time zone (the server renders in UTC). */
export function LocalTime({ unix }: { unix: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(new Date(unix * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }));
  }, [unix]);
  return <>{text || " "}</>;
}
