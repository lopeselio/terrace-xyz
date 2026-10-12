"use client";
import { useEffect, useState } from "react";
import { Seg } from "./ui";

/** Dark (default), Light or match the system. Saved per device in localStorage. */
export type ThemeChoice = "dark" | "light" | "system";
const KEY = "terrace.theme";

function apply(choice: ThemeChoice) {
  const light = choice === "light" || (choice === "system" && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f6f7f5" : "#0a0a0a");
}

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");

  useEffect(() => {
    let saved: ThemeChoice = "dark";
    try {
      saved = (localStorage.getItem(KEY) as ThemeChoice) || "dark";
    } catch {}
    setChoice(saved);
    apply(saved);
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const pick = (c: ThemeChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    apply(c);
  };

  return (
    <Seg
      sub
      value={choice}
      onChange={pick}
      options={[
        { id: "dark", label: "Dark" },
        { id: "light", label: "Light" },
        { id: "system", label: "System" },
      ]}
    />
  );
}
