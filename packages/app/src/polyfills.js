// CJS so require() calls execute in strict order — no import hoisting.
// This file must be the very first require() in index.js so TextDecoder
// is patched before @privy-io/js-sdk-core is evaluated.
require("fast-text-encoding");
require("react-native-get-random-values");

// fast-text-encoding provides TextDecoder but throws on { fatal: true }.
// @privy-io/js-sdk-core calls new TextDecoder('utf-8', { fatal: true })
// at module evaluation time, so the patch must run before any Privy import.
var _TD = global.TextDecoder;
if (_TD) {
  global.TextDecoder = function TextDecoder(label, opts) {
    return new _TD(label, opts && opts.fatal ? { label: label, ignoreBOM: opts.ignoreBOM } : opts);
  };
  global.TextDecoder.prototype = _TD.prototype;
}

// Hermes's atob is strict about base64 padding. jose's browser build calls atob()
// on base64url payloads WITHOUT adding the required '=' padding first, which throws.
// Patch atob to add missing padding before decoding.
var _atob = global.atob;
if (_atob) {
  global.atob = function atob(str) {
    var s = str.replace(/\s/g, '');
    s += '==='.slice(0, (4 - (s.length % 4)) % 4);
    return _atob(s);
  };
}

// ─── crypto.subtle polyfill ───────────────────────────────────────────────────
// @solana/kit's getProgramDerivedAddress checks:
//   typeof globalThis.crypto.subtle?.digest === "function"
// Old-arch React Native/Hermes does NOT expose crypto.subtle natively.
// We inline a pure-JS SHA-256 so there are no Metro resolution issues.
(function () {
  if (
    typeof global.crypto === 'object' &&
    global.crypto !== null &&
    typeof global.crypto.subtle === 'object' &&
    global.crypto.subtle !== null &&
    typeof global.crypto.subtle.digest === 'function'
  ) {
    // Already available natively — nothing to do.
    return;
  }

  // ── Inline pure-JS SHA-256 ────────────────────────────────────────────────
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function rotr32(n, b) { return (n >>> b) | (n << (32 - b)); }

  function sha256sync(input) {
    var bytes = input instanceof Uint8Array ? input
      : input instanceof ArrayBuffer    ? new Uint8Array(input)
      : ArrayBuffer.isView(input)       ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      :                                   new Uint8Array(input);

    var msgLen = bytes.length;
    var padLen = (msgLen + 9 + 63) & ~63;
    var padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    var dv = new DataView(padded.buffer);
    // Bit length as big-endian 64-bit (high word then low word)
    dv.setUint32(padLen - 8, Math.floor((msgLen * 8) / 0x100000000), false);
    dv.setUint32(padLen - 4, (msgLen * 8) >>> 0, false);

    var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
        h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    var W = new Uint32Array(64);

    for (var i = 0; i < padLen; i += 64) {
      for (var j = 0; j < 16; j++) W[j] = dv.getUint32(i + j * 4, false);
      for (j = 16; j < 64; j++) {
        var s0 = rotr32(W[j-15], 7)  ^ rotr32(W[j-15], 18) ^ (W[j-15] >>> 3);
        var s1 = rotr32(W[j-2],  17) ^ rotr32(W[j-2],  19) ^ (W[j-2]  >>> 10);
        W[j] = (W[j-16] + s0 + W[j-7] + s1) >>> 0;
      }
      var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for (j = 0; j < 64; j++) {
        var S1   = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        var ch   = (e & f) ^ (~e & g);
        var tmp1 = (h + S1 + ch + K[j] + W[j]) >>> 0;
        var S0   = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        var maj  = (a & b) ^ (a & c) ^ (b & c);
        var tmp2 = (S0 + maj) >>> 0;
        h=g; g=f; f=e; e=(d+tmp1)>>>0; d=c; c=b; b=a; a=(tmp1+tmp2)>>>0;
      }
      h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
      h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
    }

    var out = new Uint8Array(32);
    var ov = new DataView(out.buffer);
    ov.setUint32(0,  h0, false); ov.setUint32(4,  h1, false);
    ov.setUint32(8,  h2, false); ov.setUint32(12, h3, false);
    ov.setUint32(16, h4, false); ov.setUint32(20, h5, false);
    ov.setUint32(24, h6, false); ov.setUint32(28, h7, false);
    return out;
  }

  if (typeof global.crypto !== 'object' || global.crypto === null) {
    global.crypto = {};
  }

  global.crypto.subtle = {
    digest: function (algorithm, data) {
      var alg = typeof algorithm === 'string' ? algorithm.toUpperCase()
        : (algorithm && algorithm.name)        ? algorithm.name.toUpperCase()
        :                                         '';
      if (alg !== 'SHA-256') {
        return Promise.reject(new Error('crypto.subtle polyfill: unsupported algorithm ' + alg));
      }
      try {
        return Promise.resolve(sha256sync(data).buffer);
      } catch (e) {
        return Promise.reject(e);
      }
    },
  };

  // @solana/kit also checks globalThis.isSecureContext before any crypto ops.
  if (!globalThis.isSecureContext) {
    globalThis.isSecureContext = true;
  }
})();
