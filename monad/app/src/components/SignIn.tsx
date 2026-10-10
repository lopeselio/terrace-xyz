"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useAccount } from "@/lib/account";

/** One passkey ceremony. No seed phrase, no extension, no email code. */
export function SignIn({ reason = "Save your picks and join the chat." }: { reason?: string }) {
  const { status, error, join, login } = useAccount();
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    try {
      setReturning(localStorage.getItem("terrace.hasPasskey") === "1");
    } catch {}
  }, []);
  const busy = status === "signing-in";

  return (
    <div className="sheet">
      <p style={{ margin: "0 0 12px", fontWeight: 700 }}>{reason}</p>
      <button className="cta" onClick={returning ? login : join} disabled={busy}>
        <Icon name="shield" size={18} />
        {busy ? "Checking your passkey…" : returning ? "Continue with your passkey" : "Join with Face ID or fingerprint"}
      </button>
      <button className="link-btn" onClick={returning ? join : login} disabled={busy}>
        {returning ? "New here? Create a passkey" : "I've played before"}
      </button>
      <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>No seed phrase, no app to install. Your passkey is your account on any device.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
