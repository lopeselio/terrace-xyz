// Empty stand-in for Node stdlib modules (`fs`, `path`, …) that some
// transitive dep imports at bundle time but doesn't actually call at runtime
// in our hot paths. If something does call into these, it'll throw a clear
// "X is not a function" rather than crashing the bundler.
"use strict";
module.exports = {};
module.exports.default = module.exports;
