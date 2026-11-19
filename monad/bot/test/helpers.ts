import type { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { Terrace } from "../src/terrace";
import { FIXTURES } from "./fixtures";

export const BOT_INFO: UserFromGetMe = {
  id: 999, is_bot: true, first_name: "Terrace", username: "TerraceBot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
} as UserFromGetMe;

/** Captures every Telegram API call instead of sending it. */
export function capture(bot: Bot) {
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  let id = 500;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: method === "sendMessage" ? { message_id: ++id, date: 0, chat: { id: (payload as { chat_id: number }).chat_id, type: "group" } } : true } as never;
  });
  return calls;
}

let uid = 1;
export function groupText(text: string, from = { id: 7, first_name: "Dave" }, chatId = -100, reply?: { from: typeof BOT_INFO }): Update & { message: { chat: { type: string } } } {
  return {
    update_id: uid++,
    message: {
      message_id: uid++, date: 0, text, chat: { id: chatId, type: "group" as const, title: "Lads" }, from: { ...from, is_bot: false },
      entities: text.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: text.split(/\s/)[0].length }] : [],
      ...(reply ? { reply_to_message: { message_id: 1, date: 0, chat: { id: chatId, type: "group" as const, title: "Lads" }, from: reply.from, text: "x" } } : {}),
    },
  } as never;
}

/** A fake Terrace app: match list, compiler and indexer, with knobs for tests. */
export function fakeTerrace(state: { markets?: unknown[]; bets?: unknown[]; compileError?: string } = {}) {
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/matches")) return Response.json(FIXTURES.map((f) => ({ ...f, elapsed: null, goals: { home: null, away: null } })));
    if (u.endsWith("/api/compile-take")) {
      if (state.compileError) return Response.json({ error: state.compileError }, { status: 502 });
      const { text } = JSON.parse(String(init!.body));
      return Response.json({ spec: "0xabc", reading: `${text}: settles on the official result.`, closeTime: FIXTURES[0].kickoff });
    }
    if (u.endsWith("/api/indexer")) {
      const { query } = JSON.parse(String(init!.body));
      if (query.includes("Bet(")) return Response.json({ data: { Bet: state.bets ?? [] } });
      if (query.includes("Player(")) return Response.json({ data: { Player: [] } });
      return Response.json({ data: { Market: state.markets ?? [] } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return new Terrace("https://play.terrace.social", fetcher);
}
