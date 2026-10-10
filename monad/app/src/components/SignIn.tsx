"use client";
import { useEffect, useState } from "react";
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
    <div className="plain-card signin">
      <p className="signin-reason">{reason}</p>
      <div className="signin-actions">
        {returning ? (
          <>
            <button className="btn" onClick={login} disabled={busy}>{busy ? "Checking your passkey…" : "Continue with your passkey"}</button>
            <button className="btn-quiet" onClick={join} disabled={busy}>New here? Create one</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={join} disabled={busy}>{busy ? "Setting you up…" : "Join with Face ID or fingerprint"}</button>
            <button className="btn-quiet" onClick={login} disabled={busy}>I've played before</button>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
