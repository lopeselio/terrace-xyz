"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Header } from "./Header";
import { SignIn } from "./SignIn";
import { Empty } from "./ui";
import { useAccount } from "@/lib/account";
import { showError } from "@/lib/errors";

/** Must match the Terrace bot's linkMessage (monad/bot/src/server.ts). */
const linkMessage = (code: string) => `Link my Terrace record to Telegram: ${code}`;

/*
 * /mylink lands here from Telegram with a one-time code. The fan confirms with their own account (one
 * signature, nothing sent or spent) and the bot learns which Terrace record to show on their groups' tables.
 */
export function LinkTelegram() {
  const q = useSearchParams();
  const code = q.get("code") ?? "";
  // Only the configured bot: never a URL from the link, or a forged link could carry the confirmation elsewhere.
  const bot = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || "").replace(/\/+$/, "");
  const { status, address, sign } = useAccount();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function confirm() {
    setState("busy");
    setError(null);
    try {
      if (!bot) throw new Error("Telegram linking isn't switched on here yet.");
      const signature = await sign(linkMessage(code));
      const r = await fetch(`${bot}/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, address, signature }) });
      const body = (await r.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!r.ok) throw new Error(body.error === "expired" ? "That link has run out. Send /mylink to the bot for a fresh one." : "Couldn't link that one. Send /mylink to the bot and try again.");
      setName(body.name ?? "");
      setState("done");
    } catch (e) {
      setError(showError(e));
      setState("idle");
    }
  }

  return (
    <>
      <Header title="Link Telegram" back="/me" />
      <div className="sec" style={{ paddingTop: 12 }}>
        {!code || !bot ? (
          <Empty title="That link isn't complete">Send /mylink to the Terrace bot in Telegram for a fresh one.</Empty>
        ) : status !== "ready" ? (
          <SignIn reason="Sign in to put your Terrace record on your group's table." />
        ) : state === "done" ? (
          <Empty title="Linked" action={<Link className="cta" href="/">Back to Terrace</Link>}>
            {name ? `${name}, your` : "Your"} record now shows on your groups&apos; tables. Head back to Telegram.
          </Empty>
        ) : (
          <Empty
            title="Put your record on the group table"
            action={
              <button className="cta" disabled={state === "busy"} onClick={confirm}>
                {state === "busy" ? "Linking…" : "Link my Telegram"}
              </button>
            }
          >
            Your group sees your fan name, points and record. Nothing else is shared, and nothing is spent.
            {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
          </Empty>
        )}
      </div>
    </>
  );
}
