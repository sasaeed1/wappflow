import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // Pin the workspace root so the stray repo-root lockfile stops confusing Turbopack.
  turbopack: { root: __dirname },
  // Lets the deploy script build into a staging dir (NEXT_DIST=.next.staging) so a
  // failed/OOM build never overwrites the live .next. Defaults to .next otherwise.
  distDir: process.env.NEXT_DIST || ".next",
  // Content Security Policy (PROP-006). Scripts may only come from this site and
  // Google sign-in; plugins are off; the page can't be framed by other sites and
  // its <base> can't be rewritten. 'unsafe-inline' stays for scripts because Next's
  // hydration and the pre-paint theme script are inline (nonces would force every
  // page dynamic). Images, media and API/WebSocket hosts are left open on purpose:
  // storage (R2) and LiveKit hosts differ per deployment.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src * data: blob:",
      "media-src * data: blob:",
      "connect-src *",
      "frame-src 'self' https://accounts.google.com https://www.youtube.com https://player.vimeo.com https://calendly.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
