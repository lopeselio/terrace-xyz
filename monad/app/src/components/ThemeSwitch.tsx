"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
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

const read = (): ThemeChoice => {
  try {
    return (localStorage.getItem(KEY) as ThemeChoice) || "dark";
  } catch {
    return "dark";
  }
};

/** The theme choice, shared by every switch on the page (header button, Profile). */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");

  useEffect(() => {
    const sync = () => setChoice(read());
    sync();
    apply(read());
    window.addEventListener("terrace-theme", sync);
    return () => window.removeEventListener("terrace-theme", sync);
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const pick = (c: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    apply(c);
    setChoice(c);
    window.dispatchEvent(new Event("terrace-theme"));
  };
  return { choice, pick };
}

export function ThemeSwitch() {
  const { choice, pick } = useTheme();
  return (
    <Seg
      sub
      value={choice}
      onChange={pick}
      options={[
        { id: "dark", label: "Dark", icon: "moon" },
        { id: "light", label: "Light", icon: "sun" },
        { id: "system", label: "System", icon: "monitor" },
      ]}
    />
  );
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { dark: "light", light: "system", system: "dark" };
const LABEL: Record<ThemeChoice, string> = { dark: "Dark theme", light: "Light theme", system: "Match system theme" };

/** Header button: one tap cycles Dark → Light → System. */
export function ThemeButton() {
  const { choice, pick } = useTheme();
  return (
    <button className="iconbtn" aria-label={`${LABEL[choice]} (tap to change)`} title={LABEL[choice]} onClick={() => pick(NEXT[choice])}>
      <Icon name={choice === "light" ? "sun" : choice === "system" ? "monitor" : "moon"} />
    </button>
  );
}
