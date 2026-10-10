import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The rule language and sealing code are shared with the CRE workflows in ../cre/shared.
  experimental: { externalDir: true },
  // Files outside the app (../cre/shared) fall back to the app's node_modules,
  // so a deploy only needs the app's own install.
  webpack: (config) => {
    config.resolve.modules = [...(config.resolve.modules ?? ["node_modules"]), path.join(here, "node_modules")];
    return config;
  },
};
export default nextConfig;
