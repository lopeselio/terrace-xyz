"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useAccount } from "@/lib/account";

/** One passkey ceremony. No seed phrase, no extension, no email code. */
export function SignIn({ reason = "Save your picks and join the chat.", bare }: { reason?: string; bare?: boolean }) {
  const { status, error, join, login } = useAccount();
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    try {
      setReturning(localStorage.getItem("terrace.hasPasskey") === "1");
    } catch {}
  }, []);
  const busy = status === "signing-in";

  return (
    <div className={bare ? undefined : "card"} style={bare ? undefined : { marginTop: 12 }}>
      <div className="uname" style={{ marginBottom: 12 }}>{reason}</div>
      <button className="cta" onClick={returning ? login : join} disabled={busy}>
        <Icon name="shield" size={18} />
        {busy ? "Checking your passkey…" : returning ? "Continue with your passkey" : "Join with Face ID or fingerprint"}
      </button>
      <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} onClick={returning ? join : login} disabled={busy}>
        {returning ? "New here? Create a passkey" : "I already have an account"}
      </button>
      <div className="umeta" style={{ textAlign: "center", marginTop: 10 }}>No seed phrase, no app to install. Your passkey is your account on any device.</div>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
