import { Database } from "bun:sqlite";

/*
 * The bot's own small table of who's where: pending takes waiting for their first backer, which
 * Terrace markets belong to which chats, and which Telegram users linked which Terrace accounts.
 * No funds and no keys live here.
 */

export type Pending = {
  token: string;
  chatId: number;
  messageId: number | null;
  authorTg: number;
  authorName: string;
  text: string;
  fixtureId: number;
  stake: number;
  closeTime: number;
  reading: string;
  ruled: boolean;
  createdAt: number;
  marketId: string | null;
  takeId: string | null;
};

export type ChatMarket = { chatId: number; marketId: string; fixtureId: number; token: string; createdAt: number; settledAt: number | null; answer: number | null };

export class Store {
  db: Database;
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending (
        token TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, message_id INTEGER, author_tg INTEGER NOT NULL, author_name TEXT NOT NULL,
        text TEXT NOT NULL, fixture_id INTEGER NOT NULL, stake REAL NOT NULL, close_time INTEGER NOT NULL, reading TEXT NOT NULL,
        ruled INTEGER NOT NULL, created_at INTEGER NOT NULL, market_id TEXT, take_id TEXT
      );
      CREATE TABLE IF NOT EXISTS chat_markets (
        chat_id INTEGER NOT NULL, market_id TEXT NOT NULL, fixture_id INTEGER NOT NULL, token TEXT NOT NULL, created_at INTEGER NOT NULL,
        settled_at INTEGER, answer INTEGER, PRIMARY KEY (chat_id, market_id)
      );
      CREATE INDEX IF NOT EXISTS chat_markets_fixture ON chat_markets (fixture_id);
      CREATE TABLE IF NOT EXISTS links (tg_user INTEGER PRIMARY KEY, address TEXT NOT NULL, name TEXT NOT NULL, linked_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS links_address ON links (address);
      CREATE TABLE IF NOT EXISTS link_codes (code TEXT PRIMARY KEY, tg_user INTEGER NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_members (chat_id INTEGER NOT NULL, tg_user INTEGER NOT NULL, PRIMARY KEY (chat_id, tg_user));
    `);
  }

  addPending(p: Omit<Pending, "marketId" | "messageId" | "takeId">) {
    this.db
      .query(`INSERT INTO pending (token, chat_id, author_tg, author_name, text, fixture_id, stake, close_time, reading, ruled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(p.token, p.chatId, p.authorTg, p.authorName, p.text, p.fixtureId, p.stake, p.closeTime, p.reading, p.ruled ? 1 : 0, p.createdAt);
  }
  setPendingMessage(token: string, messageId: number) {
    this.db.query(`UPDATE pending SET message_id = ? WHERE token = ?`).run(messageId, token);
  }
  pending(token: string): Pending | null {
    const r = this.db.query(`SELECT * FROM pending WHERE token = ?`).get(token) as Row | null;
    return r ? toPending(r) : null;
  }
  /** Takes still waiting for their market, newest first (only ones that could still open). */
  unclaimed(nowUnix: number): Pending[] {
    return (this.db.query(`SELECT * FROM pending WHERE market_id IS NULL AND close_time > ? ORDER BY created_at DESC LIMIT 200`).all(nowUnix) as Row[]).map(toPending);
  }
  /** The first market listed for a take wins; later duplicates are ignored. Returns false if it was already claimed. */
  claim(token: string, marketId: string, takeId: string | null, nowUnix: number): boolean {
    const p = this.pending(token);
    if (!p || p.marketId) return false;
    this.db.query(`UPDATE pending SET market_id = ?, take_id = ? WHERE token = ? AND market_id IS NULL`).run(marketId, takeId, token);
    this.db.query(`INSERT OR IGNORE INTO chat_markets (chat_id, market_id, fixture_id, token, created_at) VALUES (?,?,?,?,?)`).run(p.chatId, marketId, p.fixtureId, token, nowUnix);
    return true;
  }
  /** Has this market already been claimed by some group take? */
  isClaimed(marketId: string): boolean {
    return !!this.db.query(`SELECT 1 FROM pending WHERE market_id = ?`).get(marketId);
  }
  /** Map an existing market into a chat (e.g. a market someone shared into the group). */
  mapMarket(chatId: number, marketId: string, fixtureId: number, token: string, nowUnix: number) {
    this.db.query(`INSERT OR IGNORE INTO chat_markets (chat_id, market_id, fixture_id, token, created_at) VALUES (?,?,?,?,?)`).run(chatId, marketId, fixtureId, token, nowUnix);
  }
  marketsOfChat(chatId: number, openOnly = false): ChatMarket[] {
    return (this.db.query(`SELECT * FROM chat_markets WHERE chat_id = ? ${openOnly ? "AND settled_at IS NULL" : ""} ORDER BY created_at DESC`).all(chatId) as CmRow[]).map(toCm);
  }
  chatsOfMarket(marketId: string): number[] {
    return (this.db.query(`SELECT chat_id FROM chat_markets WHERE market_id = ?`).all(marketId) as { chat_id: number }[]).map((r) => r.chat_id);
  }
  /** Chats with an unsettled market on this fixture: the fan-out list for its live updates. */
  chatsOfFixture(fixtureId: number): number[] {
    return (this.db.query(`SELECT DISTINCT chat_id FROM chat_markets WHERE fixture_id = ? AND settled_at IS NULL`).all(fixtureId) as { chat_id: number }[]).map((r) => r.chat_id);
  }
  /** Fixtures with at least one unsettled chat market: one subscription each, however many chats. */
  liveFixtures(): number[] {
    return (this.db.query(`SELECT DISTINCT fixture_id FROM chat_markets WHERE settled_at IS NULL`).all() as { fixture_id: number }[]).map((r) => r.fixture_id);
  }
  unsettledMarkets(): string[] {
    return (this.db.query(`SELECT DISTINCT market_id FROM chat_markets WHERE settled_at IS NULL`).all() as { market_id: string }[]).map((r) => r.market_id);
  }
  markSettled(marketId: string, answer: number, nowUnix: number) {
    this.db.query(`UPDATE chat_markets SET settled_at = ?, answer = ? WHERE market_id = ? AND settled_at IS NULL`).run(nowUnix, answer, marketId);
  }
  tokenOfMarket(marketId: string): string | null {
    const r = this.db.query(`SELECT token FROM chat_markets WHERE market_id = ? LIMIT 1`).get(marketId) as { token: string } | null;
    return r?.token ?? null;
  }

  // Account links (/mylink)
  newLinkCode(code: string, tgUser: number, name: string, expiresAt: number) {
    this.db.query(`DELETE FROM link_codes WHERE tg_user = ? OR expires_at < ?`).run(tgUser, Math.floor(Date.now() / 1000));
    this.db.query(`INSERT INTO link_codes (code, tg_user, name, expires_at) VALUES (?,?,?,?)`).run(code, tgUser, name, expiresAt);
  }
  /** One-time: the code is gone after this, whether or not it was still valid. */
  useLinkCode(code: string, nowUnix: number): { tgUser: number; name: string } | null {
    const r = this.db.query(`SELECT * FROM link_codes WHERE code = ?`).get(code) as { tg_user: number; name: string; expires_at: number } | null;
    this.db.query(`DELETE FROM link_codes WHERE code = ?`).run(code);
    return r && r.expires_at >= nowUnix ? { tgUser: r.tg_user, name: r.name } : null;
  }
  link(tgUser: number, address: string, name: string, nowUnix: number) {
    this.db.query(`INSERT INTO links (tg_user, address, name, linked_at) VALUES (?,?,?,?) ON CONFLICT(tg_user) DO UPDATE SET address = excluded.address, name = excluded.name, linked_at = excluded.linked_at`).run(tgUser, address.toLowerCase(), name, nowUnix);
  }
  linkOf(tgUser: number): { address: string; name: string } | null {
    return (this.db.query(`SELECT address, name FROM links WHERE tg_user = ?`).get(tgUser) as { address: string; name: string } | null) ?? null;
  }
  /** Telegram display names for Terrace accounts that linked, so results never show addresses. */
  namesOf(addresses: string[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const a of addresses) {
      const r = this.db.query(`SELECT name FROM links WHERE address = ? ORDER BY linked_at DESC LIMIT 1`).get(a.toLowerCase()) as { name: string } | null;
      if (r) out.set(a.toLowerCase(), r.name);
    }
    return out;
  }
  seen(chatId: number, tgUser: number) {
    this.db.query(`INSERT OR IGNORE INTO chat_members (chat_id, tg_user) VALUES (?,?)`).run(chatId, tgUser);
  }
  /** Linked accounts of people seen in this chat (for /table). */
  chatAccounts(chatId: number): { tgUser: number; address: string; name: string }[] {
    return this.db
      .query(`SELECT l.tg_user AS tgUser, l.address, l.name FROM chat_members m JOIN links l ON l.tg_user = m.tg_user WHERE m.chat_id = ?`)
      .all(chatId) as { tgUser: number; address: string; name: string }[];
  }
}

type Row = { token: string; chat_id: number; message_id: number | null; author_tg: number; author_name: string; text: string; fixture_id: number; stake: number; close_time: number; reading: string; ruled: number; created_at: number; market_id: string | null; take_id: string | null };
const toPending = (r: Row): Pending => ({
  token: r.token, chatId: r.chat_id, messageId: r.message_id, authorTg: r.author_tg, authorName: r.author_name, text: r.text, fixtureId: r.fixture_id,
  stake: r.stake, closeTime: r.close_time, reading: r.reading, ruled: !!r.ruled, createdAt: r.created_at, marketId: r.market_id, takeId: r.take_id,
});
type CmRow = { chat_id: number; market_id: string; fixture_id: number; token: string; created_at: number; settled_at: number | null; answer: number | null };
const toCm = (r: CmRow): ChatMarket => ({ chatId: r.chat_id, marketId: r.market_id, fixtureId: r.fixture_id, token: r.token, createdAt: r.created_at, settledAt: r.settled_at, answer: r.answer });
