"use client";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Empty } from "./ui";
import { parseStart, rememberTelegram, webApp } from "@/lib/telegram";

const BOT = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || "").replace(/\/+$/, "");

/**
 * The Mini App's front door. A Back it / Fade it / Match room button in a group opens
 * t.me/<bot>/<app>?startapp=<param>; Telegram loads this page, and it sends the fan to the same place the
 * browser link would: the take sheet, the bet sheet on an open market, or the match room.
 */
export function TelegramEntry() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    rememberTelegram();
    const w = webApp();
    w?.ready();
    w?.expand();
    w?.setHeaderColor?.("#0a0a0a");
    w?.setBackgroundColor?.("#0a0a0a");
    const param = w?.initDataUnsafe.start_param ?? new URLSearchParams(location.search).get("tgWebAppStartParam");
    const go = parseStart(param);
    if (!go) return router.replace("/");
    if (go.kind === "match") return router.replace(`/m/${go.fixtureId}`);
    try {
      if (!BOT) throw new Error("no bot");
      const r = await fetch(`${BOT}/go/${go.token}?side=${go.side}&format=json`);
      if (r.status === 404) return setError("That take has gone. Ask the group for a fresh one.");
      const { to } = (await r.json()) as { to: string };
      const u = new URL(to);
      // Same app: move within it, so Telegram's view stays as it is.
      if (u.origin === location.origin) router.replace(u.pathname + u.search + u.hash);
      else location.replace(to);
    } catch {
      setError("Couldn't open that take just now. Try the button again in a moment.");
    }
  }, [router]);

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => void start()} onError={() => void start()} />
      <div className="sec" style={{ paddingTop: 48 }}>
        {error ? (
          <Empty title="Hmm" action={<Link className="cta" href="/">Open Terrace</Link>}>{error}</Empty>
        ) : (
          <Empty title="Opening Terrace…" />
        )}
      </div>
    </>
  );
}
