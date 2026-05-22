const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

// Load .env into process.env so Expo's EXPO_PUBLIC_* transform picks them up
// during Gradle release builds (which run Metro without a shell env).
const envFile = path.resolve(projectRoot, ".env");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// @solana/* sub-packages (accounts, addresses, rpc, codecs, …) only exist as
// symlinks inside the pnpm hash directory for @solana/kit — they have no
// top-level entry in the app or monorepo node_modules.  Adding this hash's
// node_modules lets Metro's default resolver find them directly.
try {
  const kitReal = fs.realpathSync(path.resolve(projectRoot, "node_modules/@solana/kit"));
  // kitReal = .../terrace/node_modules/.pnpm/@solana+kit@<hash>/node_modules/@solana/kit
  // Two levels up: .../terrace/node_modules/.pnpm/@solana+kit@<hash>/node_modules
  const kitHashNm = path.resolve(kitReal, "../..");
  if (fs.existsSync(path.join(kitHashNm, "@solana/accounts"))) {
    config.resolver.nodeModulesPaths.push(kitHashNm);
  }
} catch (_) {}

// pnpm uses symlinks — Metro must follow them to resolve packages
config.resolver.unstable_enableSymlinks = true;
// Required for packages that use the package.json "exports" field (e.g. @noble/hashes v2)
config.resolver.unstable_enablePackageExports = true;
// react-native must come before browser so MWA resolves its .native.js build
// (which uses Android native crypto). browser is still needed for jose.
config.resolver.unstable_conditionNames = ["react-native", "browser", "require", "default"];

// Allow Metro to bundle .cjs and .mjs files — needed for @solana/* packages that
// ship conditional exports pointing to .cjs/.mjs rather than plain .js files.
config.resolver.sourceExts = [
  ...(config.resolver.sourceExts ?? ["js", "jsx", "ts", "tsx", "json"]),
  "cjs",
  "mjs",
];

// Packages that must resolve to their .native.js file (pnpm symlinks prevent
// Metro's exports condition resolver from picking the right variant).
const FORCE_NATIVE = [
  "@solana-mobile/mobile-wallet-adapter-protocol",
  "@solana-mobile/mobile-wallet-adapter-protocol-web3js",
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force MWA packages to their .native.js build (uses Android crypto, not crypto.subtle).
  // Use the symlink path (not the pnpm real path) so transitive require() calls resolve
  // relative to packages/app/node_modules where all deps are installed.
  if (FORCE_NATIVE.includes(moduleName)) {
    for (const nodeModulesDir of config.resolver.nodeModulesPaths) {
      const pkgDir = path.resolve(nodeModulesDir, moduleName);
      const nativeFile = path.join(pkgDir, "lib/cjs/index.native.js");
      // Use fs.lstatSync (not statSync) to check the symlink itself, not its target
      try {
        fs.lstatSync(pkgDir);
        if (fs.existsSync(nativeFile)) {
          // Resolve symlink one level so Metro has a stable path, but keep it
          // inside the app's node_modules tree so sibling deps resolve correctly.
          return { type: "sourceFile", filePath: nativeFile };
        }
      } catch {}
    }
  }

  // Force @arcium-hq/client to its ESM build (index.mjs). The CJS build
  // additionally requires `fs` at the top (for keypair/circuit file loading
  // on Node), which RN has no shim for; the ESM build avoids `fs`.
  if (moduleName === "@arcium-hq/client") {
    for (const nodeModulesDir of config.resolver.nodeModulesPaths) {
      const pkgDir = path.resolve(nodeModulesDir, moduleName);
      const esmFile = path.join(pkgDir, "build/index.mjs");
      try {
        if (fs.existsSync(esmFile)) {
          return { type: "sourceFile", filePath: esmFile };
        }
      } catch {}
    }
  }

  // Node `crypto` polyfill. Both arcium-hq/client builds import `crypto` for
  // AES + randomBytes. RN has no stdlib so the import has to resolve to
  // *something* — we point it at a tiny shim that implements just what
  // RescueCipher needs (sha256 + RNG) and throws clearly on AES paths.
  if (moduleName === "crypto" || moduleName === "node:crypto") {
    return {
      type: "sourceFile",
      filePath: path.resolve(projectRoot, "src/polyfills/crypto-shim.js"),
    };
  }

  // Node `fs` polyfill — empty module. The ESM build of @arcium-hq/client
  // doesn't import fs, but transitive deps occasionally do (e.g. tslib
  // dynamic imports). Anything that actually calls fs methods at runtime
  // will throw — but the bundle resolves cleanly.
  if (moduleName === "fs" || moduleName === "node:fs" || moduleName === "path" || moduleName === "node:path") {
    return {
      type: "sourceFile",
      filePath: path.resolve(projectRoot, "src/polyfills/empty-module.js"),
    };
  }

  // Resolve packages that pnpm symlinks but Metro fails to follow.
  // Walk nodeModulePaths and resolve the symlink to its real path.
  const PNPM_RESOLVE = ["fast-text-encoding", "expo-notifications"];
  if (PNPM_RESOLVE.includes(moduleName)) {
    for (const nodeModulesDir of config.resolver.nodeModulesPaths) {
      const pkgDir = path.resolve(nodeModulesDir, moduleName);
      try {
        const real = fs.realpathSync(pkgDir);
        const pkg = JSON.parse(fs.readFileSync(path.join(real, "package.json"), "utf8"));
        const main = pkg.main || "index.js";
        return { type: "sourceFile", filePath: path.resolve(real, main) };
      } catch {}
    }
  }

  // Resolve @noble subpath imports by walking up to the real package dir.
  const nobleMatch = moduleName.match(/^(@noble\/[^/]+)\/(.+)$/);
  if (nobleMatch) {
    const pkg = nobleMatch[1];
    const sub = nobleMatch[2].replace(/\.js$/, "") + ".js";
    for (const nodeModulesDir of config.resolver.nodeModulesPaths) {
      const candidate = path.resolve(nodeModulesDir, pkg, sub);
      if (fs.existsSync(candidate)) {
        return { type: "sourceFile", filePath: candidate };
      }
    }
  }

  // Suppress the exports-mismatch warning for @noble/hashes internal relative
  // imports (e.g. ./crypto.js). Metro's unstable_enablePackageExports raises a
  // warning when an internal file isn't listed in the package's exports map, but
  // since it falls back correctly we just resolve it directly to skip the noise.
  if (moduleName.includes("@noble/hashes") || moduleName.includes("@noble+hashes")) {
    if (fs.existsSync(moduleName)) {
      return { type: "sourceFile", filePath: moduleName };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
