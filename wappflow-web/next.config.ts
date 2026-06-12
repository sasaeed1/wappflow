import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // Pin the workspace root so the stray repo-root lockfile stops confusing Turbopack.
  turbopack: { root: __dirname },
};

export default nextConfig;
