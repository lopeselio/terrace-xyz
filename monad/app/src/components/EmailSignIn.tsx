"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "@/lib/account";
import { emailBridge, emailSignInEnabled } from "@/lib/email";
import { friendlyError } from "@/lib/errors";
import { signInsOf } from "@/lib/vault";

/** Email, then the six-digit code Privy sends, then `onVerified`. Skips straight on if Privy remembers this device. */
function EmailCode({ cta, onVerified }: { cta: string; onVerified: () => Promise<unknown> }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const remembered = (() => {
    if (forgot) return null;
    try {
      return emailBridge().email();
    } catch {
      return null;
    }
  })();

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      console.error("[email sign-in]", e);
      // In development, show what actually failed under the friendly line.
      const detail = process.env.NODE_ENV !== "production" && e instanceof Error ? ` (${e.message.slice(0, 200)})` : "";
      setError(friendlyError(e) + detail);
    } finally {
      setBusy(false);
    }
  }

  if (remembered) {
    return (
      <div>
        <button className="cta cta-ghost cta-sm" disabled={busy} onClick={() => run(onVerified)}>
          {busy ? "Opening…" : `${cta} as ${remembered}`}
        </button>
        <button
          className="textbtn"
          style={{ display: "block", margin: "8px auto 0", fontSize: 12.5 }}
          disabled={busy}
          onClick={() => run(async () => { await emailBridge().logout(); setForgot(true); })}
        >
          Not you? Use another email
        </button>
        {error && <p className="error" style={{ textAlign: "center", marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {step === "email" ? (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await emailBridge().sendCode(email.trim()); setStep("code"); }); }}>
          <label className="field">
            <input type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} disabled={busy || !email.includes("@")}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await emailBridge().loginWithCode(code.trim()); await onVerified(); }); }}>
          <div className="umeta" style={{ marginBottom: 8, textAlign: "center" }}>We sent a 6-digit code to <b>{email}</b>.</div>
          <label className="field">
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: 20, fontWeight: 700 }}
              autoFocus
            />
          </label>
          <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} disabled={busy || code.trim().length < 6}>
            {busy ? "Opening your account…" : cta}
          </button>
          <button type="button" className="textbtn" style={{ display: "block", margin: "8px auto 0" }} onClick={() => { setStep("email"); setCode(""); }}>
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="error" style={{ textAlign: "center", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

/** "Use email instead" under the passkey buttons. Hidden unless email sign-in is switched on. */
export function EmailSignIn({ onDone }: { onDone?: () => void }) {
  const { loginEmail } = useAccount();
  const [open, setOpen] = useState(false);
  if (!emailSignInEnabled()) return null;
  if (!open) {
    return (
      <button className="textbtn" style={{ display: "block", margin: "10px auto 0", fontSize: 12.5, color: "var(--ink-2)" }} onClick={() => setOpen(true)}>
        No Face ID? <span className="green">Use email instead</span>
      </button>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div className="umeta" style={{ textAlign: "center", marginBottom: 8 }}>
        New here? This makes your account. Already play with Face ID? Sign in with Face ID, then add your email in Profile.
      </div>
      <EmailCode cta="Continue" onVerified={async () => { if (await loginEmail()) onDone?.(); }} />
    </div>
  );
}

/** Profile: which ways in this account has (from the vault, not just this session), and adding the other one. */
export function SignInMethods() {
  const { method, address, linkEmail, addPasskey } = useAccount();
  const [ins, setIns] = useState<{ passkey: boolean; emails: Address[] } | null>(null);
  const [addingEmail, setAddingEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (address) signInsOf(address).then(setIns).catch(() => {});
  }, [address]);
  useEffect(() => {
    load();
    window.addEventListener("terrace-signins", load);
    return () => window.removeEventListener("terrace-signins", load);
  }, [load]);

  if (!emailSignInEnabled() || !method) return null;

  const hasPasskey = method === "passkey" || Boolean(ins?.passkey);
  const hasEmail = method === "email" || Boolean(ins?.emails.length);
  // The address itself never goes on-chain; show it when this browser's Privy session is the linked one.
  const shownEmail = (() => {
    try {
      const b = emailBridge();
      const mine = method === "email" || ins?.emails.some((e) => e.toLowerCase() === b.walletNow()?.toLowerCase());
      return mine ? b.email() : null;
    } catch {
      return null;
    }
  })();

  async function addFaceId() {
    setBusy(true);
    setError(null);
    try {
      await addPasskey();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: "4px 14px" }}>
      <div className="kv">
        <div>
          <div className="v">Face ID or fingerprint</div>
          <div className="umeta">{hasPasskey ? "One tap on any phone or laptop with your passkey." : "Sign in with one tap next time, no code."}</div>
        </div>
        {hasPasskey ? (
          <span className="umeta green">On</span>
        ) : (
          <button className="chip" disabled={busy || !ins} onClick={addFaceId}>{busy ? "Adding…" : "Add"}</button>
        )}
      </div>
      <div className="kv">
        <div style={{ minWidth: 0 }}>
          <div className="v">Email</div>
          <div className="umeta" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {hasEmail ? shownEmail ?? "A code to your email opens this account." : "For a laptop or phone without your passkey."}
          </div>
        </div>
        {hasEmail ? (
          <span className="umeta green">On</span>
        ) : (
          !addingEmail && <button className="chip" disabled={!ins} onClick={() => setAddingEmail(true)}>Add</button>
        )}
      </div>
      {addingEmail && !hasEmail && (
        <div style={{ padding: "4px 0 12px" }}>
          <EmailCode cta="Link this email" onVerified={async () => { await linkEmail(); setAddingEmail(false); }} />
        </div>
      )}
      {error && <p className="error" style={{ margin: "0 0 10px" }}>{error}</p>}
    </div>
  );
}
