import { TelegramEntry } from "@/components/TelegramEntry";

export const metadata = { title: "Terrace" };

/** Telegram Mini App entry (BotFather: /newapp, URL https://play.terrace.social/tg). */
export default function TelegramPage() {
  return <TelegramEntry />;
}
