// PWA web manifest (Next metadata route → served at /manifest.webmanifest, auto-linked).
export default function manifest() {
  return {
    name: 'WappFlow',
    short_name: 'WappFlow',
    description: 'AI-powered customer operations — CRM, Media Studio & Contracts Studio.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0f',
    theme_color: '#6366f1',
    // Chrome will not treat an app as installable — and so never fires
    // `beforeinstallprompt` — without a raster icon of at least 192x192 AND one
    // of 512x512. This manifest listed only the SVG, so the app could not be
    // installed at all and any install prompt would have been dead code.
    // The PNGs are generated from the same mark (lib/pwaIcon.js).
    //
    // `maskable` is kept on its own entry: Android crops a maskable icon to the
    // device's shape, so declaring the plain mark maskable would let the crop
    // eat the glyph's edges.
    icons: [
      { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
