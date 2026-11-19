"use client";
import { useEffect, useState } from "react";
import { inTelegram, openOutside } from "@/lib/telegram";

/**
 * Inside Telegram, Face ID may not be allowed (it's up to Telegram's in-app view). After a passkey attempt
 * fails there, offer the same page in the phone's own browser. Email sign-in keeps working in Telegram.
 */
export function OpenInBrowser({ failed }: { failed: boolean }) {
  const [tg, setTg] = useState(false);
  useEffect(() => setTg(inTelegram()), []);
  if (!tg || !failed) return null;
  return (
    <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} onClick={() => openOutside(location.href.split("#")[0])}>
      Use Face ID in your browser instead
    </button>
  );
}
