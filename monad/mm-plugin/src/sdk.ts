import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type * as Sdk from "@metamask/agent-wallet/plugin";

// mm runs plugins in its own process, so the plugin SDK must be mm's own copy. A second copy
// fails mm's `instanceof PluginCommand` check, and crashes on load because mm has already
// shimmed `window` and the copy's browser code then calls window.addEventListener.
function hostSdkUrl(): string | undefined {
  const bin = process.argv[1];
  if (!bin || !existsSync(bin)) return;
  for (let dir = dirname(realpathSync(bin)); dir !== dirname(dir); dir = dirname(dir)) {
    const file = join(dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    if (pkg.name !== "@metamask/agent-wallet") continue;
    const entry = pkg.exports?.["./plugin"]?.import ?? "./dist/plugin.js";
    return pathToFileURL(join(dir, entry)).href;
  }
}

const url = hostSdkUrl();
// Outside mm (the smoke test), the package's own copy is the only one, so it is safe.
const sdk: typeof Sdk = url ? await import(url) : await import("@metamask/agent-wallet/plugin");

export const { InputFieldType, PluginCommand, schemaToArgs, schemaToFlags } = sdk;
