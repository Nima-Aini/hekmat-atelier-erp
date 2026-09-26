import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Release correctness takes priority over reusing compiler state across git checkouts.
  experimental: { turbopackFileSystemCacheForBuild: false },
};

export default nextConfig;
