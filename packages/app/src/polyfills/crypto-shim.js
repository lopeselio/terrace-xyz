// Minimal Node `crypto` polyfill — just enough for @arcium-hq/client's
// ESM build to bundle in React Native. Metro is told to resolve any
// `require('crypto')` / `import 'crypto'` to this file via
// `metro.config.js → resolver.extraNodeModules.crypto`.
//
// What's implemented:
//   - randomBytes(n)         → uses react-native-get-random-values (already
//                              installed for @solana/kit), returns a Buffer-
//                              like Uint8Array.
//   - createHash('sha256')   → @noble/hashes/sha2 (already a transitive dep)
//
// What throws at runtime (deliberately — proves nothing in our hot path
// touches these):
//   - createCipheriv / createDecipheriv  — RescueCipher only needs the
//     hash + RNG; the AES classes in @arcium-hq/client (aes128/192/256-
//     Cipher) are unused by Terrace, but their imports get pulled into the
//     bundle. The shim's stub keeps the import resolvable; if Terrace ever
//     starts using those AES paths the call site will throw clearly here.
//
// Real Node `crypto` exposes far more (createHmac, pbkdf2, scryptSync, …).
// We can grow this shim as needed; today's surface is intentionally small
// so we don't pull a heavy polyfill into the RN bundle.

"use strict";

// react-native-get-random-values is required as the first line in
// packages/app/src/polyfills.js, so `global.crypto.getRandomValues` exists
// by the time anything reaches this shim.
function randomBytes(n) {
  const out = new Uint8Array(n);
  if (typeof global !== "undefined" && global.crypto && typeof global.crypto.getRandomValues === "function") {
    global.crypto.getRandomValues(out);
  } else {
    // Last-resort fallback: Math.random for dev; do NOT ship to prod.
    // (In RN this branch shouldn't ever run because the polyfill loads
    // react-native-get-random-values at app boot.)
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function createHash(algorithm) {
  const alg = String(algorithm || "").toLowerCase();
  if (alg !== "sha256" && alg !== "sha-256") {
    throw new Error(
      `crypto-shim: createHash('${algorithm}') not implemented in the RN bundle. ` +
        `Only sha256 is wired today — add it to packages/app/src/polyfills/crypto-shim.js.`
    );
  }
  // Lazy require so the shim file doesn't pay the noble import cost on load.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sha256 } = require("@noble/hashes/sha2");
  const chunks = [];
  return {
    update(data) {
      const u8 = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      chunks.push(u8);
      return this;
    },
    digest(encoding) {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const combined = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { combined.set(c, off); off += c.length; }
      const h = sha256(combined);
      if (!encoding || encoding === "buffer") return h;
      if (encoding === "hex") {
        let s = "";
        for (let i = 0; i < h.length; i++) s += h[i].toString(16).padStart(2, "0");
        return s;
      }
      throw new Error(`crypto-shim: digest('${encoding}') not implemented`);
    },
  };
}

function notImplemented(name) {
  return function () {
    throw new Error(
      `crypto-shim: ${name} not implemented in the RN bundle. ` +
        `Nothing in Terrace's hot path should call this — if you hit this, ` +
        `something started using a code path the shim doesn't cover. ` +
        `Add the impl to packages/app/src/polyfills/crypto-shim.js.`
    );
  };
}

module.exports = {
  randomBytes,
  createHash,
  // Stubs for code paths we don't use but must not crash at import time:
  createCipheriv: notImplemented("createCipheriv"),
  createDecipheriv: notImplemented("createDecipheriv"),
  createHmac: notImplemented("createHmac"),
  pbkdf2: notImplemented("pbkdf2"),
  pbkdf2Sync: notImplemented("pbkdf2Sync"),
  scryptSync: notImplemented("scryptSync"),
};
// Provide a default export so `import crypto from 'crypto'` (ESM) also works.
module.exports.default = module.exports;
