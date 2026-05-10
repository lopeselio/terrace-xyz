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
