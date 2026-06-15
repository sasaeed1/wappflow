import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // Pin the workspace root so the stray repo-root lockfile stops confusing Turbopack.
  turbopack: { root: __dirname },
  // Lets the deploy script build into a staging dir (NEXT_DIST=.next.staging) so a
  // failed/OOM build never overwrites the live .next. Defaults to .next otherwise.
  distDir: process.env.NEXT_DIST || ".next",
};

export default nextConfig;
