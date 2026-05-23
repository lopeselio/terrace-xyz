/**
 * Silences the recurring "Ping reached timeout" noise from Privy's
 * EmbeddedWalletProxy.ping() heartbeat (a 15s iframe liveness check inside
 * the SDK at @privy-io/js-sdk-core/embedded/EmbeddedWalletProxy).
 *
 * The ping rejects with a plain Error whenever the embedded wallet bridge
 * is busy / backgrounded / cold, which is benign — the next ping recovers.
 * Without this filter every miss surfaces as `E ReactNativeJS: [Error: Ping
 * reached timeout]` in logcat, drowning out real errors and triggering the
 * Expo LogBox red badge.
 *
 * The hook downgrades only the exact ping-timeout message; everything else
 * passes through unchanged. Real signing-path ping timeouts are still
 * surfaced to the user via the friendly mapping in useWallet.ts.
 */

const PRIVY_PING_TIMEOUT = "Ping reached timeout";

function isPrivyPingNoise(args: unknown[]): boolean {
  for (const a of args) {
    if (a instanceof Error && a.message === PRIVY_PING_TIMEOUT) return true;
    if (typeof a === "string" && a.includes(PRIVY_PING_TIMEOUT)) return true;
  }
  return false;
}

const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

console.error = (...args: unknown[]) => {
  if (isPrivyPingNoise(args)) {
    // Keep a low-priority trace in dev so we can still see frequency
    // if we ever need to debug Privy bridge issues.
    if (__DEV__) originalWarn("[silencePrivyPing]", ...args);
    return;
  }
  originalError(...args);
};
