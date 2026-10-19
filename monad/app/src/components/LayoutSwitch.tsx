"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Seg } from "./ui";
import { LAYOUT_KEY as KEY, resolveLayout, type LayoutChoice } from "@/lib/layout";

/*
 * The phone / desktop switch. Saved per device in localStorage and applied as <html data-layout>
 * (before first paint by LAYOUT_BOOT in layout.tsx). A fan on a computer can flip to the phone column and back.
 */
const apply = (c: LayoutChoice) => (document.documentElement.dataset.layout = resolveLayout(c, window.innerWidth));

const read = (): LayoutChoice => {
  try {
    return (localStorage.getItem(KEY) as LayoutChoice) || "auto";
  } catch {
    return "auto";
  }
};

/** The layout choice and what it resolves to right now, shared by every switch on the page. */
export function useLayout() {
  const [choice, setChoice] = useState<LayoutChoice>("auto");
  const [layout, setLayout] = useState<"phone" | "desktop">("phone");

  useEffect(() => {
    const sync = () => {
      const c = read();
      setChoice(c);
      setLayout(apply(c));
    };
    sync();
    window.addEventListener("terrace-layout", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("terrace-layout", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const pick = (c: LayoutChoice) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    setChoice(c);
    setLayout(apply(c));
    window.dispatchEvent(new Event("terrace-layout"));
  };
  return { choice, layout, pick };
}

/** Profile → Appearance (wide screens only). */
export function LayoutSwitch() {
  const { choice, pick } = useLayout();
  return (
    <div className="wide-only" style={{ marginTop: 10 }}>
      <Seg
        sub
        value={choice}
        onChange={pick}
        options={[
          { id: "auto", label: "Auto", icon: "sliders" },
          { id: "phone", label: "Phone", icon: "phone" },
          { id: "desktop", label: "Desktop", icon: "monitor" },
        ]}
      />
    </div>
  );
}

/** One tap to the other layout, labelled: in the desktop sidebar. */
export function LayoutToggle() {
  const { layout, pick } = useLayout();
  const to = layout === "desktop" ? "phone" : "desktop";
  return (
    <button className="layout-toggle" onClick={() => pick(to)} aria-label={`Switch to ${to} view`} title={`Switch to ${to} view`}>
      <Icon name={to === "desktop" ? "monitor" : "phone"} size={17} />
      <span>{to === "desktop" ? "Desktop view" : "Phone view"}</span>
    </button>
  );
}

/** Header icon (phone view on a wide screen): one tap to the desktop layout. The sidebar has the way back. */
export function LayoutButton() {
  const { pick } = useLayout();
  return (
    <button className="iconbtn layout-btn" aria-label="Switch to desktop view" title="Desktop view" onClick={() => pick("desktop")}>
      <Icon name="monitor" />
    </button>
  );
}
