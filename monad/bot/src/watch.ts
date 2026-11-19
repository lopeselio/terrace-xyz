/*
 * Background rounds: spot the market a group take opened, post full-time results, and drive the
 * per-fixture live updates. All reads; settlement itself stays with Chainlink CRE.
 */
import { takeKeyboard } from "./bot";
import type { Api } from "grammy";
import { listedLine, settlementCard, takeCard } from "./format";
import { fanName } from "./names";
import type { FixtureHub } from "./fanout";
import type { SendQueue } from "./ratelimit";
import type { Pending, Store } from "./store";
import type { IndexedBet, IndexedMarket, Terrace } from "./terrace";
import type { Fixture } from "./parse";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The pending take a freshly listed market belongs to: same match, same words, listed after the take was posted. */
export function matchPending(m: IndexedMarket, pending: Pending[]): Pending | null {
  const fx = Number(m.question.fixture?.id ?? -1);
  const at = Number(m.createdAt);
  const hits = pending.filter((p) => !p.marketId && p.fixtureId === fx && norm(p.text) === norm(m.question.text) && at >= p.createdAt - 5);
  // Oldest take first, so a copycat in another chat doesn't steal the first chat's market.
  return hits.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

/** Winners and refunds by name, never by address. Linked Telegram names first, Terrace fan names otherwise. */
export function settledNames(bets: IndexedBet[], answer: number, names: Map<string, string>) {
  const name = (a: string) => names.get(a.toLowerCase()) ?? fanName(a);
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    winners: answer === 1 || answer === 2 ? uniq(bets.filter((b) => b.side === answer).map((b) => name(b.bettor))) : [],
    refunded: answer === 3 ? uniq(bets.map((b) => name(b.bettor))) : [],
  };
}

export type WatchDeps = { botUrl: string; terraceUrl: string; store: Store; terrace: Terrace; queue: SendQueue; hub: FixtureHub; api: Api | null; tz: string; fixtures: () => Promise<Fixture[]>; now?: () => number };

export class Watcher {
  constructor(private d: WatchDeps) {}
  private get now() {
    return Math.floor((this.d.now ?? Date.now)() / 1000);
  }

  async claimRound() {
    return this.claim(this.d.store.unclaimed(this.now));
  }

  /** Look for one take's market right now (a fan tapped its link): true once it's mapped to the chat. */
  async claimOne(p: Pending) {
    return (await this.claim([p])) > 0;
  }

  private async claim(pending: Pending[]) {
    if (!pending.length) return 0;
    const since = Math.min(...pending.map((p) => p.createdAt)) - 5;
    const markets = await this.d.terrace.takeMarketsSince([...new Set(pending.map((p) => p.fixtureId))], [...new Set(pending.map((p) => p.text))], since);
    let claimed = 0;
    for (const m of markets) {
      if (this.d.store.isClaimed(m.id)) continue;
      const p = matchPending(m, pending);
      if (!p || !this.d.store.claim(p.token, m.id, m.take?.id ?? null, this.now)) continue;
      p.marketId = m.id;
      claimed++;
      await this.markOpen(p, m).catch((e) => console.warn(`edit ${p.chatId}: ${(e as Error).message}`));
    }
    return claimed;
  }

  /** Update the take card in place, keeping Back it / Fade it: /go now sends them to the live market. */
  private async markOpen(p: Pending, m: IndexedMarket) {
    if (!this.d.api || !p.messageId) return;
    const f = (await this.d.fixtures()).find((x) => x.id === p.fixtureId);
    if (!f) return;
    const text = takeCard({ author: p.authorName, text: p.text, reading: p.reading, fixture: f, closeTime: p.closeTime, stake: p.stake, ruled: p.ruled, tz: this.d.tz }) + listedLine({ backers: m.bettors, pot: (Number(m.yesPool) + Number(m.noPool)) / 1e6 });
    await this.d.api.editMessageText(p.chatId, p.messageId, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: takeKeyboard(this.d.botUrl, p.token, p.fixtureId, this.d.terraceUrl) }).catch(() => undefined);
  }

  async settleRound() {
    const ids = this.d.store.unsettledMarkets();
    if (!ids.length) return 0;
    const done = (await this.d.terrace.marketsByIds(ids)).filter((m) => m.question.answer > 0);
    if (!done.length) return 0;
    const bets = await this.d.terrace.betsOn(done.map((m) => m.id));
    const fixtures = await this.d.fixtures().catch(() => [] as Fixture[]);
    for (const m of done) {
      const mine = bets.filter((b) => b.market.id === m.id);
      const names = this.d.store.namesOf(mine.map((b) => b.bettor));
      const { winners, refunded } = settledNames(mine, m.question.answer, names);
      const fxId = Number(m.question.fixture?.id ?? 0);
      const f = fixtures.find((x) => x.id === fxId);
      const snap = this.d.hub.snapshot(fxId);
      const score = snap ? `${snap.goals.home ?? 0}-${snap.goals.away ?? 0}` : undefined;
      const text = settlementCard({ text: m.question.text, answer: m.question.answer as 1 | 2 | 3, ruled: !!m.question.spec && m.question.spec !== "0x", match: f ? `${f.home.name} v ${f.away.name}` : `Match ${fxId}`, score, winners, refunded });
      for (const chat of this.d.store.chatsOfMarket(m.id)) this.d.queue.push({ chatId: chat, text, key: `ft-${fxId}`, extra: undefined });
      this.d.store.markSettled(m.id, m.question.answer, this.now);
    }
    return done.length;
  }
}
