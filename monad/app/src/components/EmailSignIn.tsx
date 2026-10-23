"use client";
import { useState } from "react";
import { useAccount } from "@/lib/account";
import { emailBridge, emailSignInEnabled } from "@/lib/email";
import { friendlyError } from "@/lib/errors";

/** Email, then the six-digit code Privy sends, then `onVerified`. Skips straight on if Privy remembers this device. */
function EmailCode({ cta, onVerified }: { cta: string; onVerified: () => Promise<unknown> }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remembered = (() => {
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
      setError(friendlyError(e));
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
        {error && <p className="error" style={{ textAlign: "center", marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {step === "email" ? (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await emailBridge().sendCode(email.trim()); setStep("code"); }); }}>
          <input type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="cta cta-ghost cta-sm" style={{ marginTop: 8 }} disabled={busy || !email.includes("@")}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await emailBridge().loginWithCode(code.trim()); await onVerified(); }); }}>
          <div className="umeta" style={{ marginBottom: 6 }}>We sent a code to {email}.</div>
          <input autoComplete="one-time-code" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
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
      <EmailCode cta="Continue" onVerified={async () => { if (await loginEmail()) onDone?.(); }} />
    </div>
  );
}

/** Profile: add the other way in, so either one opens this account on any device. */
export function SignInMethods() {
  const { method, linkEmail, addPasskey } = useAccount();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!emailSignInEnabled() || !method) return null;

  if (done) {
    return <div className="umeta">{method === "passkey" ? "Done: your email opens this account too." : "Done: Face ID opens this account too."}</div>;
  }

  if (method === "email") {
    return (
      <div>
        <button
          className="cta cta-ghost cta-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await addPasskey();
              setDone(true);
            } catch (e) {
              setError(friendlyError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Adding Face ID…" : "Add Face ID"}
        </button>
        <div className="umeta" style={{ marginTop: 6 }}>Sign in with one tap next time, no code.</div>
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return open ? (
    <EmailCode cta="Link this email" onVerified={async () => { await linkEmail(); setDone(true); }} />
  ) : (
    <div>
      <button className="cta cta-ghost cta-sm" onClick={() => setOpen(true)}>Add email sign-in</button>
      <div className="umeta" style={{ marginTop: 6 }}>For a laptop or phone without your passkey.</div>
    </div>
  );
}
