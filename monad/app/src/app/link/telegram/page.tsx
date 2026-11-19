import { Suspense } from "react";
import { LinkTelegram } from "@/components/LinkTelegram";

export const metadata = { title: "Link Telegram · Terrace" };

export default function LinkTelegramPage() {
  return (
    <Suspense>
      <LinkTelegram />
    </Suspense>
  );
}
