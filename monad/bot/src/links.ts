/*
 * Every button the bot posts is a plain link into the Terrace app. The fan confirms with their own
 * passkey or email account there; the bot never signs, holds or moves anything.
 */

export type Side = "yes" | "no";

/** The bot's own redirect, so a button keeps working after the take's market opens. */
export const goLink = (botUrl: string, token: string, side: Side) => `${trim(botUrl)}/go/${token}?side=${side}`;

/** No market yet: open the take sheet with the take, match, side and stake already filled in. */
export function takeLink(terraceUrl: string, t: { fixtureId: number; text: string; side: Side; stake: number }) {
  const q = new URLSearchParams({ match: String(t.fixtureId), text: t.text, side: t.side, stake: String(t.stake), via: "group" });
  return `${trim(terraceUrl)}/take?${q}`;
}

/** Market open: land on the take in its match room with the bet sheet up on the chosen side. */
export function betLink(terraceUrl: string, t: { fixtureId: number; messageId: string; side: Side; stake: number }) {
  const q = new URLSearchParams({ bet: t.side, stake: String(t.stake), via: "group" });
  return `${trim(terraceUrl)}/m/${t.fixtureId}?${q}#take-${t.messageId}`;
}

export const collectLink = (terraceUrl: string) => `${trim(terraceUrl)}/live`;
export const matchLink = (terraceUrl: string, fixtureId: number) => `${trim(terraceUrl)}/m/${fixtureId}`;
export const linkPage = (terraceUrl: string, botUrl: string, code: string) =>
  `${trim(terraceUrl)}/link/telegram?${new URLSearchParams({ code, bot: trim(botUrl) })}`;

const trim = (u: string) => u.replace(/\/+$/, "");

/** Short unguessable id for a take (URL-safe). */
export function newToken(bytes = 9): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(b).toString("base64url");
}
