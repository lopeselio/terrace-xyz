const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// pnpm uses symlinks — Metro must follow them to resolve packages
config.resolver.unstable_enableSymlinks = true;
// Required for packages that use the package.json "exports" field (e.g. @noble/hashes v2)
config.resolver.unstable_enablePackageExports = true;
// react-native must come before browser so MWA resolves its .native.js build
// (which uses Android native crypto). browser is still needed for jose.
config.resolver.unstable_conditionNames = ["react-native", "browser", "require", "default"];

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

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
