/*
 * Terrace opened as a Telegram Mini App (from the group bot's buttons). Telegram's script is only loaded on
 * /tg, so later pages remember the visit in sessionStorage. See https://core.telegram.org/bots/webapps.
 */

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string; username?: string } };
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const FLAG = "terrace.tg";

export function webApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window.Telegram?.WebApp;
  return w && w.initData ? w : null;
}

/** True inside Telegram's Mini App view: Telegram's own object, the launch hash it adds, or an earlier /tg visit this session. */
export function inTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (webApp() || location.hash.includes("tgWebApp")) return true;
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function rememberTelegram() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {}
}

/** Open a page in the phone's own browser (where passkeys work), not inside Telegram. */
export function openOutside(url: string) {
  const w = webApp();
  if (w) w.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/**
 * Where a start parameter leads. The bot sends `m<fixture>` for a match room and `y<take>` / `n<take>` for
 * Back it / Fade it, where <take> is the bot's token for a group take (resolved by the bot's /go).
 */
export function parseStart(p: string | null | undefined): { kind: "match"; fixtureId: number } | { kind: "take"; token: string; side: "yes" | "no" } | null {
  if (!p) return null;
  const m = p.match(/^m(\d{1,10})$/);
  if (m) return { kind: "match", fixtureId: Number(m[1]) };
  const t = p.match(/^([yn])([\w-]{6,40})$/);
  if (t) return { kind: "take", token: t[2], side: t[1] === "n" ? "no" : "yes" };
  return null;
}
