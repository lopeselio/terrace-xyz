/*
 * Telegram allows about 30 messages a second overall, 1 a second in a chat and 20 a minute in a group.
 * Everything the bot sends goes through this queue, which keeps under those limits, merges messages
 * still waiting for the same chat, and backs off when Telegram says retry_after.
 */

export type Job = { chatId: number; text: string; extra?: Record<string, unknown>; key?: string };
export type Sender = (job: Job) => Promise<unknown>;

export type Limits = { globalPerSec: number; chatGapMs: number; groupPerMin: number };
export const TELEGRAM_LIMITS: Limits = { globalPerSec: 25, chatGapMs: 1100, groupPerMin: 18 };

export class SendQueue {
  private queue: Job[] = [];
  private lastByChat = new Map<number, number>();
  private minuteByChat = new Map<number, number[]>();
  private sentThisSecond: number[] = [];
  private pausedUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private send: Sender,
    private limits: Limits = TELEGRAM_LIMITS,
    private now: () => number = Date.now,
  ) {}

  get size() {
    return this.queue.length;
  }

  /** Queue a message. Jobs with the same key for the same chat that haven't gone yet are joined into one. */
  push(job: Job) {
    const same = job.key ? this.queue.find((j) => j.chatId === job.chatId && j.key === job.key && !j.extra && !job.extra) : undefined;
    if (same) same.text = `${same.text}\n\n${job.text}`;
    else this.queue.push({ ...job });
    this.schedule(0);
  }

  /** Send whatever is allowed right now; returns how many went. */
  async tick(): Promise<number> {
    const t = this.now();
    if (t < this.pausedUntil) return 0;
    this.sentThisSecond = this.sentThisSecond.filter((x) => t - x < 1000);
    let sent = 0;
    for (let i = 0; i < this.queue.length && this.sentThisSecond.length < this.limits.globalPerSec; ) {
      const job = this.queue[i];
      if (!this.allowed(job.chatId, t)) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      this.mark(job.chatId, t);
      sent++;
      try {
        await this.send(job);
      } catch (e) {
        const retry = (e as { parameters?: { retry_after?: number }; error_code?: number }).parameters?.retry_after;
        if (retry) {
          this.queue.unshift(job);
          this.pausedUntil = this.now() + retry * 1000;
          break;
        }
        console.warn(`send to ${job.chatId} failed: ${(e as Error).message}`);
      }
    }
    if (this.queue.length) this.schedule(this.nextDelay());
    return sent;
  }

  private allowed(chatId: number, t: number) {
    const last = this.lastByChat.get(chatId);
    if (last !== undefined && t - last < this.limits.chatGapMs) return false;
    const recent = (this.minuteByChat.get(chatId) ?? []).filter((x) => t - x < 60_000);
    this.minuteByChat.set(chatId, recent);
    return chatId > 0 || recent.length < this.limits.groupPerMin;
  }
  private mark(chatId: number, t: number) {
    this.lastByChat.set(chatId, t);
    this.minuteByChat.get(chatId)!.push(t);
    this.sentThisSecond.push(t);
  }
  private nextDelay() {
    return Math.max(50, this.pausedUntil - this.now(), Math.min(this.limits.chatGapMs, 1000));
  }
  private schedule(ms: number) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, ms);
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
