import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Disabled strict mode to prevent double-invocation that surfaces hydration
  // mismatches (#418) caused by browser extensions injecting DOM nodes.
  // Re-enable once extension-safe hydration is fully confirmed.
  reactStrictMode: false,
  
  // Force Turbopack/Next.js to resolve files relative to the frontend directory
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;

