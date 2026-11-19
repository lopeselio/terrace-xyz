"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { emailBridge, hasEmailBridge } from "@/lib/email";
import { inTelegram, webApp } from "@/lib/telegram";

const DISMISSED = "terrace.tgLinkLater";

/**
 * Inside the Telegram Mini App only. Signed out: try opening the fan's account from their linked Telegram,
 * quietly (no code, no error if it isn't linked). Signed in with email and not linked yet: offer, once, to
 * link this Telegram so next time needs no code.
 */
export function TelegramSignIn() {
  const { status, method, loginTelegram } = useAccount();
  const tried = useRef(false);
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (tried.current || status !== "signed-out" || !inTelegram()) return;
    tried.current = true;
    let stop = false;
    (async () => {
      // Privy and Telegram's script both load after the page; give them a few seconds.
      for (let i = 0; i < 40 && !(hasEmailBridge() && webApp()); i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (stop) return;
      }
      if (hasEmailBridge() && webApp()) await loginTelegram();
    })();
    return () => {
      stop = true;
    };
  }, [status, loginTelegram]);

  useEffect(() => {
    if (status !== "ready" || method !== "email" || !webApp() || !hasEmailBridge()) return setOffer(false);
    try {
      if (localStorage.getItem(DISMISSED) === "1") return;
    } catch {}
    setOffer(!emailBridge().hasTelegram());
  }, [status, method]);

  if (!offer) return null;

  async function link() {
    const w = webApp();
    if (!w) return;
    setBusy(true);
    setNote(null);
    try {
      await emailBridge().linkTelegram(w.initData);
      setNote("Done. Next time you open Terrace from Telegram, you're straight in.");
      setTimeout(() => setOffer(false), 2500);
    } catch {
      setNote("Couldn't link Telegram just now. Your email sign-in still works.");
    } finally {
      setBusy(false);
    }
  }
  function later() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
    setOffer(false);
  }

  return (
    <div className="card" role="status" style={{ position: "fixed", left: 12, right: 12, bottom: 84, zIndex: 50 }}>
      <div className="uname">Skip the email code next time?</div>
      <div className="umeta" style={{ marginTop: 4 }}>Link this Telegram to your Terrace sign-in. Only your Telegram name and id are shared.</div>
      {note ? (
        <p className="umeta" style={{ marginTop: 8 }}>{note}</p>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="cta cta-sm" disabled={busy} onClick={link}>{busy ? "Linking…" : "Link Telegram"}</button>
          <button className="cta cta-ghost cta-sm" disabled={busy} onClick={later}>Not now</button>
        </div>
      )}
    </div>
  );
}
