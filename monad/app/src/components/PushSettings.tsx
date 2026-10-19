"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Switch } from "./ui";
import { useAccount } from "@/lib/account";
import { showError } from "@/lib/errors";
import { DEFAULT_PREFS, PREF_LABELS, deviceKey, pushNote, type PushPrefs } from "@/lib/push";

/*
 * Push notifications on this device: results, challenges and new followers, sent by /api/push/run.
 * iPhones only get web push from the Home Screen app, so there we ask fans to add it first.
 */

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const iosBrowser = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches && !(navigator as { standalone?: boolean }).standalone;

function vapidKey() {
  const b64 = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const worker = () => navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);

export function usePush() {
  const { status, address, sign } = useAccount();
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    if (!supported()) return setState(iosBrowser() ? "install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const sub = await (await worker()).pushManager.getSubscription();
      if (!sub) return setState("off");
      const r = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`).then((r) => r.json());
      // Saved for someone else who signed in on this device: off for this fan until they turn it on.
      const mine = r.on && address && r.fan === address.toLowerCase();
      setPrefs(r.prefs ?? DEFAULT_PREFS);
      setState(mine ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [address]);

  useEffect(() => {
    if (status !== "ready") return;
    sync();
    window.addEventListener("terrace-push", sync);
    return () => window.removeEventListener("terrace-push", sync);
  }, [status, sync]);

  const save = useCallback(
    async (next: PushPrefs, test = false) => {
      if (!address) return;
      setBusy(true);
      setError(null);
      try {
        if ((await Notification.requestPermission()) !== "granted") {
          setState(Notification.permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await worker();
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() }));
        const json = sub.toJSON();
        const at = Math.floor(Date.now() / 1000);
        const signature = await sign(pushNote(address, deviceKey(sub.endpoint), next, at));
        const r = await fetch("/api/push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address, subscription: json, prefs: next, at, signature, test }),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setPrefs(next);
        setState("on");
        window.dispatchEvent(new Event("terrace-push"));
      } catch (e) {
        setError(showError(e));
      } finally {
        setBusy(false);
      }
    },
    [address, sign],
  );

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sub = await (await worker()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      window.dispatchEvent(new Event("terrace-push"));
    } catch (e) {
      setError(showError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, prefs, busy, error, turnOn: () => save(prefs, true), setPref: (k: keyof PushPrefs, v: boolean) => save({ ...prefs, [k]: v }), turnOff };
}

const HINT: Partial<Record<State, string>> = {
  install: "On iPhone, tap Share → Add to Home Screen, then open Terrace from there to turn these on.",
  denied: "Notifications are blocked for Terrace. Allow them in your browser or phone settings, then come back.",
  unsupported: "This browser can't show notifications.",
};

/** Profile → Notifications: the device switch, then one switch per kind once it's on. */
export function PushSettings() {
  const { state, prefs, busy, error, turnOn, setPref, turnOff } = usePush();
  if (state === "loading") return null;
  const on = state === "on";
  return (
    <div className="card" style={{ padding: "4px 14px", marginTop: 10 }}>
      <div className="kv">
        <div>
          <div className="v">Notifications on this device</div>
          <div className="umeta">{HINT[state] ?? "Results, challenges and new followers, even when Terrace is closed."}</div>
          {error && <div className="umeta red">{error}</div>}
        </div>
        {(state === "on" || state === "off") && <Switch on={on} onChange={(v) => !busy && (v ? turnOn() : turnOff())} label="Notifications on this device" />}
      </div>
      {on &&
        PREF_LABELS.map((p) => (
          <div className="kv" key={p.key}>
            <div>
              <div className="v">{p.label}</div>
              <div className="umeta">{p.sub}</div>
            </div>
            <Switch on={prefs[p.key]} onChange={(v) => !busy && setPref(p.key, v)} label={p.label} />
          </div>
        ))}
    </div>
  );
}

const DISMISS = "terrace.push.later";

/** A nudge at the top of the bell: get these as notifications. Gone once on, blocked or dismissed. */
export function PushPrompt() {
  const { state, busy, error, turnOn } = usePush();
  const [later, setLater] = useState(true);
  useEffect(() => {
    try {
      setLater(localStorage.getItem(DISMISS) === "1");
    } catch {
      setLater(false);
    }
  }, []);
  if (later || (state !== "off" && state !== "install")) return null;
  const dismiss = () => {
    setLater(true);
    try {
      localStorage.setItem(DISMISS, "1");
    } catch {}
  };
  return (
    <div className="push-prompt">
      <span className="note-icon" style={{ color: "var(--green)", borderColor: "var(--green)" }}><Icon name="bell" size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="uname" style={{ display: "block" }}>Get these as notifications</span>
        <span className={`umeta${error ? " red" : ""}`} style={{ display: "block" }}>{error ?? (state === "install" ? HINT.install : "Results, challenges and followers, even with Terrace closed.")}</span>
      </span>
      {state === "off" && <button className="cta cta-sm" style={{ width: "auto", padding: "0 14px" }} disabled={busy} onClick={turnOn}>Turn on</button>}
      <button className="iconbtn" aria-label="Not now" onClick={dismiss}><Icon name="close" size={16} /></button>
    </div>
  );
}
