/* Point Telegram at this server: bun scripts/webhook.ts (uses TELEGRAM_BOT_TOKEN, BOT_PUBLIC_URL, TELEGRAM_WEBHOOK_SECRET). */
import { Api } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN, url = process.env.BOT_PUBLIC_URL;
if (!token || !url) throw new Error("Set TELEGRAM_BOT_TOKEN and BOT_PUBLIC_URL");
const api = new Api(token);
await api.setWebhook(`${url.replace(/\/+$/, "")}/telegram`, { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined, allowed_updates: ["message", "callback_query"] });
await api.setMyCommands([
  { command: "take", description: "Turn a take into a market" },
  { command: "markets", description: "This chat's takes" },
  { command: "table", description: "This chat's table" },
  { command: "mylink", description: "Put your Terrace record on the table" },
]);
console.log(await api.getWebhookInfo());
