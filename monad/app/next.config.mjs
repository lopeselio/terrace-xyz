/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The rule language and sealing code are shared with the CRE workflows in ../cre/shared.
  experimental: { externalDir: true },
};
export default nextConfig;
