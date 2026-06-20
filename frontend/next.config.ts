import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled strict mode to prevent double-invocation that surfaces hydration
  // mismatches (#418) caused by browser extensions injecting DOM nodes.
  // Re-enable once extension-safe hydration is fully confirmed.
  reactStrictMode: false,
};

export default nextConfig;
