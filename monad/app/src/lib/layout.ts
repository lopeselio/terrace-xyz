/*
 * Phone or desktop layout, shared by the boot script in layout.tsx (server) and LayoutSwitch (client).
 * Auto picks desktop on wide windows; phones always get the phone layout.
 */
export type LayoutChoice = "auto" | "phone" | "desktop";
export const LAYOUT_KEY = "terrace.layout";
/** Narrower than this is a phone, whatever was picked. */
export const PHONE_MAX = 768;
/** Auto switches to desktop from this width. */
export const DESKTOP_MIN = 1024;

export const resolveLayout = (c: LayoutChoice, width: number) =>
  width < PHONE_MAX ? "phone" : c === "auto" ? (width >= DESKTOP_MIN ? "desktop" : "phone") : c;

/** Inline script for <head>: same rule as resolveLayout, run before React so there's no flash. */
export const LAYOUT_BOOT = `try{var l=localStorage.getItem("${LAYOUT_KEY}")||"auto",w=innerWidth;document.documentElement.dataset.layout=w<${PHONE_MAX}?"phone":l==="auto"?(w>=${DESKTOP_MIN}?"desktop":"phone"):l}catch(e){document.documentElement.dataset.layout="phone"}`;
