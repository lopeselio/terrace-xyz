"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { PREVIOUS_HOMES } from "@/lib/mera";

/** "Joined on our old address?": sign in with a passkey made where Terrace used to live. */
export function OldPasskey({ onDone }: { onDone?: () => void }) {
  const { status, loginFrom } = useAccount();
  const [homes, setHomes] = useState<string[]>([]);
  useEffect(() => setHomes(PREVIOUS_HOMES.filter((h) => h !== window.location.hostname)), []);
  if (!homes.length) return null;
  return (
    <button
      className="textbtn"
      style={{ display: "block", margin: "10px auto 0", fontSize: 12.5, color: "var(--ink-2)" }}
      disabled={status === "signing-in"}
      onClick={async () => {
        if (await loginFrom(homes[0])) onDone?.();
      }}
    >
      Joined on {homes[0]}? <span className="green">Use that passkey</span>
    </button>
  );
}
